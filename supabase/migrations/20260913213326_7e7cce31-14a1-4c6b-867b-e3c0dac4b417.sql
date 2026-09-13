ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS realized_gain numeric;

-- Backfill sells from the position-level realized_pnl where a single sell explains it.
UPDATE public.trades t
SET realized_gain = p.realized_pnl
FROM public.positions p
WHERE t.action = 'sell'
  AND t.realized_gain IS NULL
  AND p.user_id = t.user_id AND p.market_id = t.market_id
  AND (SELECT count(*) FROM public.trades t2 WHERE t2.user_id = t.user_id AND t2.market_id = t.market_id AND t2.action = 'sell') = 1;

CREATE OR REPLACE FUNCTION public.sell_shares(p_market_id uuid, p_side trade_side, p_shares numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_market markets%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_pos positions%ROWTYPE;
  v_held numeric; v_total numeric; v_spent_delta numeric; v_realized_gain numeric;
  v_p numeric; v_q numeric; v_s numeric; v_c numeric;
  v_price numeric; v_new_yes_price numeric; v_disc numeric;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error','Not authenticated'); END IF;
  IF p_shares IS NULL OR p_shares <= 0 THEN RETURN jsonb_build_object('error','Enter a number of shares'); END IF;

  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Market not found'); END IF;
  IF v_market.status <> 'open' THEN RETURN jsonb_build_object('error','Market is not open'); END IF;
  IF v_market.closes_at IS NOT NULL AND v_market.closes_at < now() THEN
    RETURN jsonb_build_object('error','Market has closed');
  END IF;

  SELECT * INTO v_pos FROM positions WHERE user_id = v_user_id AND market_id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Insufficient shares'); END IF;
  v_held := CASE WHEN p_side = 'yes' THEN v_pos.yes_shares ELSE v_pos.no_shares END;
  IF v_held < p_shares THEN RETURN jsonb_build_object('error','Insufficient shares'); END IF;

  v_s := p_shares;
  IF p_side = 'yes' THEN v_p := v_market.yes_pool; v_q := v_market.no_pool;
  ELSE v_p := v_market.no_pool; v_q := v_market.yes_pool; END IF;

  v_disc := (v_p + v_s + v_q)^2 - 4*v_s*v_q;
  IF v_disc < 0 THEN RETURN jsonb_build_object('error','Not enough liquidity for that many shares'); END IF;
  v_c := round(((v_p + v_s + v_q) - sqrt(v_disc)) / 2, 2);
  IF v_c IS NULL OR v_c <= 0 THEN RETURN jsonb_build_object('error','Trade too small'); END IF;
  IF (v_q - v_c) <= 0 OR (v_p + v_s - v_c) <= 0 THEN
    RETURN jsonb_build_object('error','Not enough liquidity for that many shares');
  END IF;

  v_price := round(v_c / v_s, 4);

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Profile not found'); END IF;

  UPDATE profiles SET credits = credits + v_c WHERE id = v_user_id;

  IF p_side = 'yes' THEN
    UPDATE markets SET yes_pool = v_p + v_s - v_c, no_pool = v_q - v_c, volume = volume + v_c WHERE id = p_market_id;
  ELSE
    UPDATE markets SET no_pool = v_p + v_s - v_c, yes_pool = v_q - v_c, volume = volume + v_c WHERE id = p_market_id;
  END IF;

  v_total := v_pos.yes_shares + v_pos.no_shares;
  IF v_total > 0 THEN
    v_spent_delta := round((p_shares / v_total) * v_pos.credits_spent, 2);
  ELSE
    v_spent_delta := 0;
  END IF;
  v_spent_delta := LEAST(v_spent_delta, v_pos.credits_spent);
  v_realized_gain := round(v_c - v_spent_delta, 2);

  UPDATE positions SET
    yes_shares = CASE WHEN p_side = 'yes' THEN yes_shares - p_shares ELSE yes_shares END,
    no_shares  = CASE WHEN p_side = 'no'  THEN no_shares - p_shares ELSE no_shares END,
    credits_spent = GREATEST(credits_spent - v_spent_delta, 0),
    realized_pnl = COALESCE(realized_pnl, 0) + v_realized_gain
  WHERE user_id = v_user_id AND market_id = p_market_id;

  SELECT no_pool / (yes_pool + no_pool) INTO v_new_yes_price FROM markets WHERE id = p_market_id;

  INSERT INTO trades (user_id, market_id, side, action, shares, credits, price, realized_gain)
  VALUES (v_user_id, p_market_id, p_side, 'sell', p_shares, v_c, v_price, v_realized_gain);

  INSERT INTO price_history (market_id, yes_price) VALUES (p_market_id, v_new_yes_price);

  RETURN jsonb_build_object('success', true, 'shares', p_shares, 'proceeds', v_c, 'price', v_price,
                            'realized_pnl', v_realized_gain,
                            'credits_remaining', v_profile.credits + v_c);
END;
$function$;

DROP FUNCTION IF EXISTS public.get_market_activity(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_market_activity(_market_id uuid, _limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, user_id uuid, username text, avatar_url text, side trade_side, action trade_action, shares numeric, credits numeric, price numeric, created_at timestamp with time zone, realized_gain numeric, market_id uuid, market_title text, market_status market_status, market_resolution market_resolution, current_yes_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.user_id, p.username, p.avatar_url, t.side, t.action,
         t.shares, t.credits, t.price, t.created_at, t.realized_gain,
         m.id, m.title, m.status, m.resolution,
         CASE WHEN m.status = 'resolved' THEN NULL
              ELSE m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0) END
  FROM public.trades t
  JOIN public.profiles p ON p.id = t.user_id
  JOIN public.markets m ON m.id = t.market_id
  WHERE t.market_id = _market_id
    AND (p.trading_history_public OR p.id = auth.uid())
  ORDER BY t.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 40), 1), 200);
$function$;

CREATE OR REPLACE FUNCTION public.get_public_trading_history(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _visible boolean;
  _trades jsonb;
  _positions jsonb;
BEGIN
  SELECT (p.trading_history_public OR p.id = auth.uid())
    INTO _visible
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF _visible IS NOT TRUE THEN
    RETURN jsonb_build_object('visible', false, 'trades', '[]'::jsonb, 'positions', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO _trades
  FROM (
    SELECT jsonb_build_object(
             'id', t.id,
             'market_id', t.market_id,
             'market_title', m.title,
             'market_status', m.status,
             'market_resolution', m.resolution,
             'current_yes_price', CASE WHEN m.status = 'resolved' THEN NULL
                                       ELSE m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0) END,
             'side', t.side,
             'action', t.action,
             'shares', t.shares,
             'price', t.price,
             'credits', t.credits,
             'realized_gain', t.realized_gain,
             'created_at', t.created_at
           ) AS x
    FROM public.trades t
    JOIN public.markets m ON m.id = t.market_id
    WHERE t.user_id = _user_id
    ORDER BY t.created_at DESC
    LIMIT 200
  ) s;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _positions
  FROM (
    SELECT jsonb_build_object(
             'market_id', pos.market_id,
             'market_title', m.title,
             'market_status', m.status,
             'yes_shares', pos.yes_shares,
             'no_shares', pos.no_shares,
             'credits_spent', pos.credits_spent,
             'value', pos.yes_shares * (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0))
                      + pos.no_shares * (1 - (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0)))
           ) AS x
    FROM public.positions pos
    JOIN public.markets m ON m.id = pos.market_id
    WHERE pos.user_id = _user_id
      AND m.status = 'open'
      AND (pos.yes_shares > 0 OR pos.no_shares > 0)
    ORDER BY m.closes_at
  ) s;

  RETURN jsonb_build_object('visible', true, 'trades', _trades, 'positions', _positions);
END;
$function$;
