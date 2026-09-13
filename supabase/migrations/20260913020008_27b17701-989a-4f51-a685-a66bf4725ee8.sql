-- Creator can no longer wager on their own bet
CREATE OR REPLACE FUNCTION public.join_group_bet(_group_bet_id uuid, _side trade_side, _credits numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
  invite RECORD;
  user_credits NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _credits <= 0 THEN RAISE EXCEPTION 'Credits must be positive'; END IF;

  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group bet not found'; END IF;
  IF b.creator_id = uid THEN RAISE EXCEPTION 'Creators can''t wager on their own bet'; END IF;
  IF b.status <> 'open' THEN RAISE EXCEPTION 'Bet not open'; END IF;
  IF b.closes_at <= now() THEN RAISE EXCEPTION 'Bet has closed'; END IF;

  SELECT * INTO invite FROM public.group_bet_invites
    WHERE group_bet_id = _group_bet_id AND invited_user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not invited'; END IF;

  IF EXISTS (SELECT 1 FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Already joined';
  END IF;

  SELECT credits INTO user_credits FROM public.profiles WHERE id = uid FOR UPDATE;
  IF user_credits < _credits THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  UPDATE public.profiles SET credits = credits - _credits WHERE id = uid;
  INSERT INTO public.group_bet_participants (group_bet_id, user_id, side, credits_wagered)
    VALUES (_group_bet_id, uid, _side, _credits);

  UPDATE public.group_bet_invites SET status = 'accepted' WHERE id = invite.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_group_bet_via_link(_group_bet_id uuid, _sharer_username text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  sharer_id UUID;
  b RECORD;
  f RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO sharer_id FROM public.profiles
    WHERE username = regexp_replace(lower(COALESCE(_sharer_username, '')), '[^a-z0-9_]', '', 'g');
  IF sharer_id IS NULL THEN RAISE EXCEPTION 'Could not find the person who shared this bet'; END IF;

  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.status <> 'open' OR b.closes_at <= now() THEN
    RAISE EXCEPTION 'This bet has already closed';
  END IF;
  IF b.creator_id = uid THEN RAISE EXCEPTION 'Creators can''t wager on their own bet'; END IF;
  IF sharer_id = uid THEN RAISE EXCEPTION 'You cannot join a bet using your own share link'; END IF;

  SELECT * INTO f FROM public.friendships
    WHERE (requester_id = sharer_id AND addressee_id = uid)
       OR (requester_id = uid AND addressee_id = sharer_id)
    LIMIT 1;
  IF FOUND THEN
    IF f.status <> 'accepted' THEN
      UPDATE public.friendships SET status = 'accepted', updated_at = now() WHERE id = f.id;
    END IF;
  ELSE
    INSERT INTO public.friendships (requester_id, addressee_id, status)
      VALUES (sharer_id, uid, 'accepted');
  END IF;

  INSERT INTO public.group_bet_invites (group_bet_id, invited_user_id)
    VALUES (_group_bet_id, uid)
    ON CONFLICT (group_bet_id, invited_user_id) DO NOTHING;
END;
$function$;

-- Creation now accepts an optional verification source
DROP FUNCTION IF EXISTS public.create_group_bet(text, text, timestamptz, uuid[]);
CREATE OR REPLACE FUNCTION public.create_group_bet(_title text, _description text, _closes_at timestamptz, _friend_ids uuid[], _resolution_source text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  bet_id UUID;
  fid UUID;
  is_friend BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _title IS NULL OR length(trim(_title)) = 0 THEN RAISE EXCEPTION 'Title required'; END IF;
  IF _closes_at <= now() THEN RAISE EXCEPTION 'Close date must be in the future'; END IF;

  INSERT INTO public.group_bets (creator_id, title, description, closes_at, resolution_source)
    VALUES (uid, _title, _description, _closes_at, NULLIF(btrim(COALESCE(_resolution_source,'')), ''))
    RETURNING id INTO bet_id;

  FOREACH fid IN ARRAY COALESCE(_friend_ids, ARRAY[]::UUID[]) LOOP
    IF fid = uid THEN CONTINUE; END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND ((requester_id = uid AND addressee_id = fid) OR (requester_id = fid AND addressee_id = uid))
    ) INTO is_friend;
    IF NOT is_friend THEN RAISE EXCEPTION 'Can only invite accepted friends'; END IF;

    INSERT INTO public.group_bet_invites (group_bet_id, invited_user_id)
      VALUES (bet_id, fid) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, kind, payload)
      VALUES (fid, 'group_bet_invite',
        jsonb_build_object('group_bet_id', bet_id, 'title', _title, 'inviter_id', uid));
  END LOOP;
  RETURN bet_id;
END;
$function$;

-- Shared payout engine (internal)
CREATE OR REPLACE FUNCTION public.finalize_group_bet(_group_bet_id uuid, _resolution group_bet_resolution, _reason text, _auto boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
        proposed_resolution = NULL, auto_resolution_deadline = NULL
    WHERE id = _group_bet_id;

  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'group_bet_resolved',
      jsonb_build_object('group_bet_id', _group_bet_id, 'title', b.title,
        'resolution', _resolution, 'reason', _reason, 'auto', _auto)
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_group_bet(uuid, group_bet_resolution, text, boolean) FROM PUBLIC, anon, authenticated;

-- Voting RPC
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
    SELECT b.creator_id AS uid
    UNION
    SELECT user_id FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id
  ) v;

  SELECT v.proposed_resolution, count(*)::int,
         (array_agg(v.reason ORDER BY v.updated_at DESC))[1]
    INTO top_res, top_votes, top_reason
    FROM public.group_bet_resolution_votes v
    WHERE v.group_bet_id = _group_bet_id
    GROUP BY v.proposed_resolution
    ORDER BY count(*) DESC
    LIMIT 1;

  IF top_votes * 2 > eligible THEN
    PERFORM public.finalize_group_bet(_group_bet_id, top_res, top_reason, false);
    RETURN jsonb_build_object('resolved', true, 'resolution', top_res, 'votes', top_votes, 'eligible', eligible);
  END IF;

  UPDATE public.group_bets SET status = 'voting' WHERE id = _group_bet_id AND status = 'open';
  RETURN jsonb_build_object('resolved', false, 'votes', top_votes, 'eligible', eligible);
END;
$function$;

-- Flag a pending automatic resolution
CREATE OR REPLACE FUNCTION public.flag_auto_resolution(_group_bet_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
        resolution_reason = NULL
    WHERE id = _group_bet_id;

  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'group_bet_auto_flagged',
      jsonb_build_object('group_bet_id', _group_bet_id, 'title', b.title)
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;
END;
$function$;

-- Cron: settle unflagged automatic resolutions
CREATE OR REPLACE FUNCTION public.finalize_pending_auto_resolutions()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN SELECT id, proposed_resolution, resolution_reason FROM public.group_bets
           WHERE status = 'pending_auto_resolution'
             AND proposed_resolution IS NOT NULL
             AND auto_resolution_deadline IS NOT NULL
             AND auto_resolution_deadline <= now()
  LOOP
    PERFORM public.finalize_group_bet(r.id, r.proposed_resolution, r.resolution_reason, true);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_pending_auto_resolutions() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.resolve_group_bet(uuid, group_bet_resolution);

SELECT cron.schedule('finalize-pending-auto-resolutions', '0 * * * *',
  $$SELECT public.finalize_pending_auto_resolutions();$$);