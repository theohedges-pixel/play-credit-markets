CREATE OR REPLACE FUNCTION public.propose_group_bet_resolution(_group_bet_id uuid, _resolution group_bet_resolution, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
  eligible INT;
  top_votes INT;
  top_res group_bet_resolution;
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

  SELECT v.proposed_resolution, count(*)::int
    INTO top_res, top_votes
    FROM public.group_bet_resolution_votes v
    WHERE v.group_bet_id = _group_bet_id
    GROUP BY v.proposed_resolution
    ORDER BY count(*) DESC
    LIMIT 1;

  IF top_votes * 2 > eligible THEN
    IF top_res = _resolution THEN
      top_reason := btrim(_reason);
    ELSE
      SELECT v.reason INTO top_reason FROM public.group_bet_resolution_votes v
        WHERE v.group_bet_id = _group_bet_id AND v.proposed_resolution = top_res
        ORDER BY v.updated_at DESC LIMIT 1;
    END IF;
    PERFORM public.finalize_group_bet(_group_bet_id, top_res, top_reason, false);
    RETURN jsonb_build_object('resolved', true, 'resolution', top_res, 'votes', top_votes, 'eligible', eligible);
  END IF;

  UPDATE public.group_bets SET status = 'voting' WHERE id = _group_bet_id AND status = 'open';
  RETURN jsonb_build_object('resolved', false, 'votes', top_votes, 'eligible', eligible);
END;
$function$;

REVOKE ALL ON FUNCTION public.propose_group_bet_resolution(uuid, group_bet_resolution, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_group_bet_resolution(uuid, group_bet_resolution, text) TO authenticated;