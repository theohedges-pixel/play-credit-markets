-- 48-hour voting window; majority of those who actually voted wins; nobody voted -> refund.
CREATE OR REPLACE FUNCTION public.finalize_group_bet_voting_deadlines()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  top_votes INT;
  second_votes INT;
  top_res group_bet_resolution;
  n INT := 0;
BEGIN
  FOR r IN SELECT id FROM public.group_bets
           WHERE status = 'voting'
             AND voting_started_at IS NOT NULL
             AND now() - voting_started_at > interval '48 hours'
  LOOP
    SELECT v.proposed_resolution, v.c INTO top_res, top_votes
      FROM (
        SELECT proposed_resolution, count(*)::int AS c
          FROM public.group_bet_resolution_votes
          WHERE group_bet_id = r.id
          GROUP BY proposed_resolution
          ORDER BY count(*) DESC
      ) v
      LIMIT 1;

    SELECT v.c INTO second_votes
      FROM (
        SELECT count(*)::int AS c
          FROM public.group_bet_resolution_votes
          WHERE group_bet_id = r.id
          GROUP BY proposed_resolution
          ORDER BY count(*) DESC
          OFFSET 1 LIMIT 1
      ) v;

    IF top_votes IS NULL THEN
      PERFORM public.finalize_group_bet(
        r.id, 'invalid'::group_bet_resolution,
        'Nobody said what the outcome was within 48 hours — everyone got their credits back.',
        false, 'no_votes_refund');
    ELSIF second_votes IS NOT NULL AND second_votes = top_votes THEN
      PERFORM public.finalize_group_bet(
        r.id, 'invalid'::group_bet_resolution,
        'The vote was tied after 48 hours — everyone got their credits back.',
        false, 'no_consensus_refund');
    ELSE
      PERFORM public.finalize_group_bet(
        r.id, top_res,
        'Settled by majority of those who voted within 48 hours.',
        false, 'majority_fallback');
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

-- Bets waiting on the signed-in user's outcome vote.
CREATE OR REPLACE FUNCTION public.my_pending_group_bet_votes()
 RETURNS TABLE(id uuid, title text, description text, closes_at timestamp with time zone,
               voting_started_at timestamp with time zone, votes_cast integer, eligible integer)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.id, b.title, b.description, b.closes_at, b.voting_started_at,
    (SELECT count(*)::int FROM public.group_bet_resolution_votes v WHERE v.group_bet_id = b.id),
    (SELECT count(*)::int FROM (
        SELECT b.creator_id AS vid
        UNION
        SELECT p.user_id FROM public.group_bet_participants p WHERE p.group_bet_id = b.id
     ) e)
  FROM public.group_bets b
  WHERE auth.uid() IS NOT NULL
    AND b.status IN ('open', 'voting')
    AND b.closes_at <= now()
    AND (b.creator_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.group_bet_participants p
                    WHERE p.group_bet_id = b.id AND p.user_id = auth.uid()))
    AND NOT EXISTS (SELECT 1 FROM public.group_bet_resolution_votes v
                    WHERE v.group_bet_id = b.id AND v.voter_id = auth.uid())
  ORDER BY b.closes_at;
$function$;

REVOKE ALL ON FUNCTION public.my_pending_group_bet_votes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_group_bet_votes() TO authenticated;