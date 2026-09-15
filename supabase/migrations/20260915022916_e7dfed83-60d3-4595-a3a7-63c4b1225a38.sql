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
             'yes_pool', CASE WHEN m.status = 'open' THEN m.yes_pool ELSE NULL END,
             'no_pool', CASE WHEN m.status = 'open' THEN m.no_pool ELSE NULL END,
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