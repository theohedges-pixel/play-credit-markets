ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS realized_pnl numeric NOT NULL DEFAULT 0;

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

  INSERT INTO trades (user_id, market_id, side, action, shares, credits, price)
  VALUES (v_user_id, p_market_id, p_side, 'sell', p_shares, v_c, v_price);

  INSERT INTO price_history (market_id, yes_price) VALUES (p_market_id, v_new_yes_price);

  RETURN jsonb_build_object('success', true, 'shares', p_shares, 'proceeds', v_c, 'price', v_price,
                            'realized_pnl', v_realized_gain,
                            'credits_remaining', v_profile.credits + v_c);
END;
$function$;

REVOKE ALL ON FUNCTION public.sell_shares(uuid, trade_side, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_shares(uuid, trade_side, numeric) TO authenticated;

CREATE OR REPLACE VIEW public.leaderboard_net_worth
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  p.credits,
  COALESCE(pv.position_value, 0) AS position_value,
  p.credits + COALESCE(pv.position_value, 0) AS net_worth
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT SUM(
    pos.yes_shares * (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0))
    + pos.no_shares * (1 - (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0)))
  ) AS position_value
  FROM public.positions pos
  JOIN public.markets m ON m.id = pos.market_id
  WHERE pos.user_id = p.id AND m.status = 'open'
) pv ON TRUE;

GRANT SELECT ON public.leaderboard_net_worth TO authenticated;