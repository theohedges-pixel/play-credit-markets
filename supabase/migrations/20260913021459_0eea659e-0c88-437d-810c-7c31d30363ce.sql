ALTER TABLE public.group_bets
  ADD COLUMN IF NOT EXISTS voting_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_method text;

DROP FUNCTION IF EXISTS public.finalize_group_bet(uuid, group_bet_resolution, text, boolean);

CREATE OR REPLACE FUNCTION public.finalize_group_bet(_group_bet_id uuid, _resolution group_bet_resolution, _reason text, _auto boolean, _method text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b RECORD;
  pot NUMERIC;
  winning_total NUMERIC;
  p RECORD;
  _pay NUMERIC;
BEGIN
  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF b.status = 'resolved' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  SELECT COALESCE(SUM(credits_wagered), 0) INTO pot
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;

  IF _resolution = 'invalid' THEN
    FOR p IN SELECT * FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id LOOP
      UPDATE public.profiles SET credits = credits + p.credits_wagered WHERE id = p.user_id;
      UPDATE public.group_bet_participants SET payout = p.credits_wagered WHERE id = p.id;
    END LOOP;
  ELSE
    SELECT COALESCE(SUM(credits_wagered), 0) INTO winning_total
      FROM public.group_bet_participants
      WHERE group_bet_id = _group_bet_id AND side::text = _resolution::text;

    IF winning_total = 0 THEN
      FOR p IN SELECT * FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id LOOP
        UPDATE public.profiles SET credits = credits + p.credits_wagered WHERE id = p.user_id;
        UPDATE public.group_bet_participants SET payout = p.credits_wagered WHERE id = p.id;
      END LOOP;
    ELSE
      FOR p IN SELECT * FROM public.group_bet_participants
               WHERE group_bet_id = _group_bet_id AND side::text = _resolution::text LOOP
        _pay := (p.credits_wagered / winning_total) * pot;
        UPDATE public.profiles SET credits = credits + _pay WHERE id = p.user_id;
        UPDATE public.group_bet_participants SET payout = _pay WHERE id = p.id;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.group_bets
    SET status = 'resolved', resolution = _resolution, resolved_at = now(),
        resolution_reason = _reason, auto_resolved = _auto,
        resolution_method = COALESCE(_method, CASE WHEN _auto THEN 'ai' ELSE 'unanimous' END),
        proposed_resolution = NULL, auto_resolution_deadline = NULL
    WHERE id = _group_bet_id;

  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'group_bet_resolved',
      jsonb_build_object('group_bet_id', _group_bet_id, 'title', b.title,
        'resolution', _resolution, 'reason', _reason, 'auto', _auto,
        'method', COALESCE(_method, CASE WHEN _auto THEN 'ai' ELSE 'unanimous' END))
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.propose_group_bet_resolution(_group_bet_id uuid, _resolution group_bet_resolution, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
  eligible INT;
  total_votes INT;
  distinct_res INT;
  only_res group_bet_resolution;
  top_reason TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN RAISE EXCEPTION 'Please give a short reason'; END IF;

  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.closes_at > now() THEN RAISE EXCEPTION 'This bet has not closed yet'; END IF;
  IF b.status NOT IN ('open', 'voting') THEN RAISE EXCEPTION 'This bet is not open for voting'; END IF;

  IF b.creator_id <> uid AND NOT EXISTS (
    SELECT 1 FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'Only the creator and participants can vote';
  END IF;

  -- Entering the voting flow starts the 24h unanimity clock.
  UPDATE public.group_bets
    SET status = 'voting', voting_started_at = COALESCE(voting_started_at, now())
    WHERE id = _group_bet_id AND status IN ('open', 'voting');

  INSERT INTO public.group_bet_resolution_votes (group_bet_id, voter_id, proposed_resolution, reason)
    VALUES (_group_bet_id, uid, _resolution, btrim(_reason))
    ON CONFLICT (group_bet_id, voter_id)
    DO UPDATE SET proposed_resolution = EXCLUDED.proposed_resolution,
                  reason = EXCLUDED.reason, updated_at = now();

  SELECT count(*) INTO eligible FROM (
    SELECT b.creator_id AS vid
    UNION
    SELECT user_id FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id
  ) v;

  SELECT count(*)::int, count(DISTINCT proposed_resolution)::int, min(proposed_resolution)
    INTO total_votes, distinct_res, only_res
    FROM public.group_bet_resolution_votes WHERE group_bet_id = _group_bet_id;

  -- Unanimous: everyone eligible voted, and all chose the same outcome.
  IF total_votes >= eligible AND distinct_res = 1 THEN
    SELECT v.reason INTO top_reason FROM public.group_bet_resolution_votes v
      WHERE v.group_bet_id = _group_bet_id ORDER BY v.updated_at DESC LIMIT 1;
    PERFORM public.finalize_group_bet(_group_bet_id, only_res, top_reason, false, 'unanimous');
    RETURN jsonb_build_object('resolved', true, 'resolution', only_res, 'votes', total_votes, 'eligible', eligible);
  END IF;

  RETURN jsonb_build_object('resolved', false, 'votes', total_votes, 'eligible', eligible);
END;
$function$;

CREATE OR REPLACE FUNCTION public.flag_auto_resolution(_group_bet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.status <> 'pending_auto_resolution' THEN RAISE EXCEPTION 'There is nothing to flag on this bet'; END IF;
  IF b.auto_resolution_deadline IS NOT NULL AND b.auto_resolution_deadline <= now() THEN
    RAISE EXCEPTION 'The review window has already passed';
  END IF;
  IF b.creator_id <> uid AND NOT EXISTS (
    SELECT 1 FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'Only the creator and participants can flag this';
  END IF;

  UPDATE public.group_bets
    SET status = 'voting', proposed_resolution = NULL, auto_resolution_deadline = NULL,
        auto_resolved = false,
        resolution_reason = NULL,
        voting_started_at = COALESCE(voting_started_at, now())
    WHERE id = _group_bet_id;

  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'group_bet_auto_flagged',
      jsonb_build_object('group_bet_id', _group_bet_id, 'title', b.title)
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;
END;
$function$;

-- Move closed bets with no pending AI check into the voting flow and start the clock.
CREATE OR REPLACE FUNCTION public.open_group_bet_voting()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n INT;
BEGIN
  WITH upd AS (
    UPDATE public.group_bets
      SET status = 'voting', voting_started_at = COALESCE(voting_started_at, now())
      WHERE status = 'open'
        AND closes_at <= now()
        AND (resolution_source IS NULL OR btrim(resolution_source) = '' OR auto_checked_at IS NOT NULL)
      RETURNING 1
  ) SELECT count(*)::int INTO n FROM upd;
  RETURN n;
END;
$function$;

-- 24h fallback: majority wins, otherwise refund everyone.
CREATE OR REPLACE FUNCTION public.finalize_group_bet_voting_deadlines()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  eligible INT;
  top_votes INT;
  top_res group_bet_resolution;
  n INT := 0;
BEGIN
  FOR r IN SELECT id, creator_id FROM public.group_bets
           WHERE status = 'voting'
             AND voting_started_at IS NOT NULL
             AND now() - voting_started_at > interval '24 hours'
  LOOP
    SELECT count(*) INTO eligible FROM (
      SELECT r.creator_id AS vid
      UNION
      SELECT user_id FROM public.group_bet_participants WHERE group_bet_id = r.id
    ) v;

    SELECT v.proposed_resolution, count(*)::int INTO top_res, top_votes
      FROM public.group_bet_resolution_votes v
      WHERE v.group_bet_id = r.id
      GROUP BY v.proposed_resolution
      ORDER BY count(*) DESC
      LIMIT 1;

    IF top_votes IS NOT NULL AND top_votes * 2 > eligible THEN
      PERFORM public.finalize_group_bet(
        r.id, top_res,
        'Settled by majority vote after unanimous agreement wasn''t reached within 24 hours.',
        false, 'majority_fallback');
    ELSE
      PERFORM public.finalize_group_bet(
        r.id, 'invalid'::group_bet_resolution,
        'No consensus reached within 24 hours — bet refunded.',
        false, 'no_consensus_refund');
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.finalize_group_bet(uuid, group_bet_resolution, text, boolean, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.open_group_bet_voting() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_group_bet_voting_deadlines() FROM anon, authenticated, PUBLIC;