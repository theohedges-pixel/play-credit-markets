
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS proposed_resolution market_resolution,
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT,
  ADD COLUMN IF NOT EXISTS resolution_method TEXT,
  ADD COLUMN IF NOT EXISTS auto_resolved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_resolution_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_manual_resolution BOOLEAN NOT NULL DEFAULT false;

-- Shared payout engine: used by manual resolution, Polymarket mirroring and the
-- 24h auto-resolution finalizer so every path pays out identically.
CREATE OR REPLACE FUNCTION public.finalize_market_resolution(
  _market_id UUID, _resolution market_resolution, _reason TEXT, _method TEXT, _auto BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; pos RECORD; payout NUMERIC;
BEGIN
  SELECT * INTO m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF m.status = 'resolved' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  FOR pos IN SELECT * FROM public.positions WHERE market_id = _market_id LOOP
    IF _resolution = 'yes' THEN payout := pos.yes_shares;
    ELSIF _resolution = 'no' THEN payout := pos.no_shares;
    ELSE payout := pos.credits_spent;
    END IF;
    IF payout > 0 THEN
      UPDATE public.profiles SET credits = credits + payout WHERE id = pos.user_id;
    END IF;
  END LOOP;

  UPDATE public.markets
    SET status = 'resolved', resolution = _resolution, resolved_at = now(),
        resolution_reason = COALESCE(_reason, resolution_reason),
        resolution_method = _method, auto_resolved = _auto,
        proposed_resolution = NULL, auto_resolution_deadline = NULL,
        needs_manual_resolution = false
    WHERE id = _market_id;

  INSERT INTO public.notifications (user_id, kind, payload)
  SELECT DISTINCT p.user_id, 'market_resolved',
    jsonb_build_object('market_id', _market_id, 'title', m.title,
      'resolution', _resolution, 'reason', _reason, 'method', _method, 'auto', _auto)
  FROM public.positions p
  WHERE p.market_id = _market_id AND (p.yes_shares > 0 OR p.no_shares > 0);
END; $$;

-- Manual resolution (creator or admin) now routes through the shared engine.
CREATE OR REPLACE FUNCTION public.resolve_market(_market_id UUID, _resolution market_resolution)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); m RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO m FROM public.markets WHERE id = _market_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF NOT (uid = m.creator_id OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Not allowed to resolve';
  END IF;
  PERFORM public.finalize_market_resolution(_market_id, _resolution, m.resolution_reason, 'manual', false);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- Position holders can flag a proposed outcome during the review window.
CREATE OR REPLACE FUNCTION public.flag_market_resolution(_market_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); m RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF m.proposed_resolution IS NULL OR m.status = 'resolved' THEN
    RAISE EXCEPTION 'There is nothing to flag on this market';
  END IF;
  IF m.auto_resolution_deadline IS NOT NULL AND m.auto_resolution_deadline <= now() THEN
    RAISE EXCEPTION 'The review window has already passed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.positions p
    WHERE p.market_id = _market_id AND p.user_id = uid AND (p.yes_shares > 0 OR p.no_shares > 0)
  ) THEN
    RAISE EXCEPTION 'Only people holding a position in this market can flag it';
  END IF;

  UPDATE public.markets
    SET proposed_resolution = NULL, auto_resolution_deadline = NULL, auto_resolved = false,
        needs_manual_resolution = true,
        resolution_reason = 'Auto-resolution was flagged by a position holder and needs manual review.'
    WHERE id = _market_id;
END; $$;

-- Cron: pay out proposals whose 24h window expired unflagged.
CREATE OR REPLACE FUNCTION public.finalize_pending_market_resolutions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT id, proposed_resolution, resolution_reason, resolution_method
           FROM public.markets
           WHERE status = 'closed' AND proposed_resolution IS NOT NULL
             AND auto_resolution_deadline IS NOT NULL AND auto_resolution_deadline <= now()
  LOOP
    PERFORM public.finalize_market_resolution(
      r.id, r.proposed_resolution, r.resolution_reason,
      COALESCE(r.resolution_method, 'ai_verified'), true);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- Admin queue: closed markets with no outcome yet, longest wait first.
CREATE OR REPLACE FUNCTION public.admin_markets_needing_resolution()
RETURNS TABLE(id UUID, title TEXT, closes_at TIMESTAMPTZ, created_via TEXT, volume NUMERIC,
              waiting_hours NUMERIC, needs_manual_resolution BOOLEAN,
              proposed_resolution TEXT, resolution_reason TEXT,
              auto_resolution_deadline TIMESTAMPTZ, holders BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT m.id, m.title, m.closes_at, m.created_via::text, m.volume,
         round(EXTRACT(EPOCH FROM (now() - m.closes_at)) / 3600.0, 1),
         m.needs_manual_resolution, m.proposed_resolution::text, m.resolution_reason,
         m.auto_resolution_deadline,
         (SELECT count(*) FROM public.positions p
           WHERE p.market_id = m.id AND (p.yes_shares > 0 OR p.no_shares > 0))
  FROM public.markets m
  WHERE m.status = 'closed' AND m.resolution IS NULL
  ORDER BY m.closes_at ASC;
END; $$;

REVOKE EXECUTE ON FUNCTION public.finalize_market_resolution(UUID, market_resolution, TEXT, TEXT, BOOLEAN) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_pending_market_resolutions() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_market_resolution(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_markets_needing_resolution() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_market_resolution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_markets_needing_resolution() TO authenticated;

SELECT cron.schedule(
  'finalize-market-resolutions-hourly',
  '7 * * * *',
  $cron$SELECT public.finalize_pending_market_resolutions();$cron$
);
