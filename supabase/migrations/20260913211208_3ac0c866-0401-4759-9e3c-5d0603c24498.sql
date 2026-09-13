ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trading_history_public boolean NOT NULL DEFAULT true;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
  SELECT id, username, avatar_url, bio, peak_net_worth, trading_history_public, created_at
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Single enforcement point for cross-user trading visibility: a user's history
-- is readable when they have opted in, or when they are the caller.
CREATE OR REPLACE FUNCTION public.get_public_trading_history(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
             'side', t.side,
             'action', t.action,
             'shares', t.shares,
             'price', t.price,
             'credits', t.credits,
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
$$;

-- Market activity feed: every trader who has opted in (plus the caller's own
-- trades), enforced by the same flag.
CREATE OR REPLACE FUNCTION public.get_market_activity(_market_id uuid, _limit integer DEFAULT 40)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  side trade_side,
  action trade_action,
  shares numeric,
  credits numeric,
  price numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, p.username, p.avatar_url, t.side, t.action,
         t.shares, t.credits, t.price, t.created_at
  FROM public.trades t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.market_id = _market_id
    AND (p.trading_history_public OR p.id = auth.uid())
  ORDER BY t.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 40), 1), 200);
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_trading_history(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_market_activity(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_public_trading_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_activity(uuid, integer) TO authenticated;