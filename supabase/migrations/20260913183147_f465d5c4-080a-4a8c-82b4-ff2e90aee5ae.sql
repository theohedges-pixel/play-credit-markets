
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);

-- Internal guard reused by every admin function.
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  RETURN uid;
END; $$;

-- Notify every admin except the actor.
CREATE OR REPLACE FUNCTION public.notify_admins(_actor UUID, _kind TEXT, _payload JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, kind, payload)
  SELECT DISTINCT ur.user_id, _kind, _payload
  FROM public.user_roles ur
  WHERE ur.role = 'admin' AND ur.user_id <> _actor;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_admin(_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := public.require_admin();
  actor TEXT; target TEXT;
BEGIN
  SELECT username INTO target FROM public.profiles WHERE id = _target_id;
  IF target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target_id AND role = 'admin') THEN
    RAISE EXCEPTION '@% is already an admin', target;
  END IF;
  SELECT username INTO actor FROM public.profiles WHERE id = uid;

  INSERT INTO public.user_roles (user_id, role, granted_at)
    VALUES (_target_id, 'admin', now()) ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, target_id, details)
    VALUES (uid, 'grant_admin', _target_id,
      jsonb_build_object('actor_username', actor, 'target_username', target));

  PERFORM public.notify_admins(uid, 'admin_granted',
    jsonb_build_object('actor_id', uid, 'actor_username', actor,
                       'target_id', _target_id, 'target_username', target));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_admin(_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := public.require_admin();
  actor TEXT; target TEXT; n INT;
BEGIN
  IF _target_id = uid THEN RAISE EXCEPTION 'You cannot revoke your own admin access'; END IF;
  SELECT count(*) INTO n FROM public.user_roles WHERE role = 'admin';
  IF n <= 1 THEN RAISE EXCEPTION 'Cannot remove the last remaining admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target_id AND role = 'admin') THEN
    RAISE EXCEPTION 'That user is not an admin';
  END IF;
  SELECT username INTO target FROM public.profiles WHERE id = _target_id;
  SELECT username INTO actor FROM public.profiles WHERE id = uid;

  DELETE FROM public.user_roles WHERE user_id = _target_id AND role = 'admin';

  INSERT INTO public.admin_audit_log (admin_id, action, target_id, details)
    VALUES (uid, 'revoke_admin', _target_id,
      jsonb_build_object('actor_username', actor, 'target_username', target));

  PERFORM public.notify_admins(uid, 'admin_revoked',
    jsonb_build_object('actor_id', uid, 'actor_username', actor,
                       'target_id', _target_id, 'target_username', target));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE(user_id UUID, username TEXT, avatar_url TEXT, granted_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, p.username, p.avatar_url, ur.granted_at
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin' AND public.has_role(auth.uid(), 'admin')
  ORDER BY ur.granted_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(_search TEXT DEFAULT '', _limit INT DEFAULT 25, _offset INT DEFAULT 0)
RETURNS TABLE(id UUID, username TEXT, created_at TIMESTAMPTZ, credits NUMERIC,
              net_worth NUMERIC, email_confirmed BOOLEAN, is_admin BOOLEAN, total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q TEXT := '%' || lower(coalesce(_search, '')) || '%';
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT v.id, v.username, v.created_at, v.credits, v.net_worth,
         (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
         EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v.id AND ur.role = 'admin') AS is_admin,
         count(*) OVER () AS total_count
  FROM public.leaderboard_net_worth v
  LEFT JOIN auth.users u ON u.id = v.id
  WHERE lower(v.username) LIKE q
  ORDER BY v.created_at DESC
  LIMIT greatest(1, least(_limit, 100)) OFFSET greatest(0, _offset);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_trades(_user_id UUID, _limit INT DEFAULT 100)
RETURNS TABLE(id UUID, market_id UUID, market_title TEXT, side TEXT, action TEXT,
              shares NUMERIC, credits NUMERIC, price NUMERIC, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT t.id, t.market_id, m.title, t.side::text, t.action::text,
         t.shares, t.credits, t.price, t.created_at
  FROM public.trades t JOIN public.markets m ON m.id = t.market_id
  WHERE t.user_id = _user_id
  ORDER BY t.created_at DESC
  LIMIT greatest(1, least(_limit, 500));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_positions(_user_id UUID)
RETURNS TABLE(market_id UUID, market_title TEXT, market_status TEXT, resolution TEXT,
              yes_shares NUMERIC, no_shares NUMERIC, credits_spent NUMERIC, realized_pnl NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.market_id, m.title, m.status::text, m.resolution::text,
         p.yes_shares, p.no_shares, p.credits_spent, p.realized_pnl
  FROM public.positions p JOIN public.markets m ON m.id = p.market_id
  WHERE p.user_id = _user_id
  ORDER BY m.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_overview(_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res JSONB;
BEGIN
  PERFORM public.require_admin();
  SELECT jsonb_build_object(
    'username', p.username,
    'bio', p.bio,
    'credits', p.credits,
    'created_at', p.created_at,
    'email_confirmed', (SELECT u.email_confirmed_at IS NOT NULL FROM auth.users u WHERE u.id = p.id),
    'invites_sent', (SELECT count(*) FROM public.referrals r WHERE r.referrer_id = p.id),
    'invites_credited', (SELECT count(*) FROM public.referrals r WHERE r.referrer_id = p.id AND r.reward_credited),
    'referral_credits', (SELECT count(*) * 200 FROM public.referrals r WHERE r.referrer_id = p.id AND r.reward_credited),
    'invited_by', (SELECT rp.username FROM public.referrals r JOIN public.profiles rp ON rp.id = r.referrer_id WHERE r.referred_id = p.id),
    'group_bets_created', (SELECT count(*) FROM public.group_bets b WHERE b.creator_id = p.id),
    'group_bets_joined', (SELECT count(*) FROM public.group_bet_participants gp WHERE gp.user_id = p.id),
    'group_bets', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'closes_at' DESC) FROM (
        SELECT jsonb_build_object('id', b.id, 'title', b.title, 'status', b.status,
               'closes_at', b.closes_at, 'role', CASE WHEN b.creator_id = p.id THEN 'creator' ELSE 'participant' END,
               'wagered', gp.credits_wagered, 'payout', gp.payout) AS x
        FROM public.group_bets b
        LEFT JOIN public.group_bet_participants gp ON gp.group_bet_id = b.id AND gp.user_id = p.id
        WHERE b.creator_id = p.id OR gp.user_id = p.id
      ) s), '[]'::jsonb)
  ) INTO res FROM public.profiles p WHERE p.id = _user_id;
  IF res IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  RETURN res;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_prunable_markets()
RETURNS TABLE(id UUID, title TEXT, created_at TIMESTAMPTZ, closes_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT m.id, m.title, m.created_at, m.closes_at
  FROM public.markets m
  WHERE m.status = 'open'
    AND (m.created_via = 'polymarket_import' OR m.source = 'polymarket')
    AND m.volume = 0
    AND NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.market_id = m.id)
  ORDER BY m.created_at ASC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_prune_markets(_ids UUID[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := public.require_admin();
  mid UUID; deleted INT := 0; skipped INT := 0; deleted_ids UUID[] := '{}';
BEGIN
  FOREACH mid IN ARRAY COALESCE(_ids, ARRAY[]::UUID[]) LOOP
    -- Independent server-side re-verification: never delete a market with trades.
    IF EXISTS (SELECT 1 FROM public.trades t WHERE t.market_id = mid)
       OR EXISTS (SELECT 1 FROM public.positions p WHERE p.market_id = mid)
       OR NOT EXISTS (SELECT 1 FROM public.markets m WHERE m.id = mid AND m.status = 'open' AND m.volume = 0)
    THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    DELETE FROM public.price_history WHERE market_id = mid;
    DELETE FROM public.markets WHERE id = mid;
    deleted := deleted + 1;
    deleted_ids := deleted_ids || mid;
  END LOOP;

  IF deleted > 0 OR skipped > 0 THEN
    INSERT INTO public.admin_audit_log (admin_id, action, target_id, details)
    VALUES (uid, 'markets_pruned', NULL,
      jsonb_build_object('deleted', deleted, 'skipped', skipped, 'market_ids', to_jsonb(deleted_ids)));
  END IF;
  RETURN jsonb_build_object('deleted', deleted, 'skipped', skipped);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activity_series(_days INT DEFAULT 30)
RETURNS TABLE(day DATE, signups BIGINT, trades BIGINT, trade_volume NUMERIC,
              group_bets BIGINT, referral_credits NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d INT := greatest(1, least(COALESCE(_days, 30), 365));
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH days AS (
    SELECT generate_series((current_date - (d - 1)), current_date, interval '1 day')::date AS day
  )
  SELECT g.day,
    (SELECT count(*) FROM public.profiles p WHERE p.created_at::date = g.day),
    (SELECT count(*) FROM public.trades t WHERE t.created_at::date = g.day),
    (SELECT COALESCE(sum(t.credits), 0) FROM public.trades t WHERE t.created_at::date = g.day),
    (SELECT count(*) FROM public.group_bets b WHERE b.created_at::date = g.day),
    (SELECT COALESCE(count(*) * 200, 0)::numeric FROM public.referrals r WHERE r.reward_credited AND r.created_at::date = g.day)
  FROM days g ORDER BY g.day ASC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_audit_list(_limit INT DEFAULT 100)
RETURNS TABLE(id UUID, admin_id UUID, admin_username TEXT, action TEXT, target_id UUID,
              target_username TEXT, details JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT l.id, l.admin_id, ap.username, l.action, l.target_id, tp.username, l.details, l.created_at
  FROM public.admin_audit_log l
  LEFT JOIN public.profiles ap ON ap.id = l.admin_id
  LEFT JOIN public.profiles tp ON tp.id = l.target_id
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(_limit, 500));
END; $$;

REVOKE EXECUTE ON FUNCTION public.require_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_admins(UUID, TEXT, JSONB) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_grant_admin(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_admin(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_admins() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(TEXT, INT, INT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_trades(UUID, INT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_positions(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_overview(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_prunable_markets() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_prune_markets(UUID[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_activity_series(INT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_audit_list(INT) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_grant_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_trades(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_positions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_overview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prunable_markets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prune_markets(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activity_series(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_list(INT) TO authenticated;

-- Bulk grant: every existing account becomes an admin.
WITH ins AS (
  INSERT INTO public.user_roles (user_id, role, granted_at)
  SELECT p.id, 'admin', now() FROM public.profiles p
  ON CONFLICT (user_id, role) DO NOTHING
  RETURNING user_id
)
INSERT INTO public.admin_audit_log (admin_id, action, target_id, details)
SELECT NULL, 'bulk_grant_admin', NULL,
  jsonb_build_object('granted_count', count(*), 'user_ids', COALESCE(jsonb_agg(user_id), '[]'::jsonb),
                     'note', 'Applied directly by migration')
FROM ins;
