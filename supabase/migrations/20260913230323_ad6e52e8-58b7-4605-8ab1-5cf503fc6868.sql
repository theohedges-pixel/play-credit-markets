CREATE OR REPLACE FUNCTION public.join_group_bet(_group_bet_id uuid, _side trade_side, _credits numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF b.status <> 'open' THEN RAISE EXCEPTION 'Bet not open'; END IF;
  IF b.closes_at <= now() THEN RAISE EXCEPTION 'Bet has closed'; END IF;

  -- The creator may wager on their own bet. Resolution needs unanimity (or a
  -- majority fallback) among all eligible voters, so they cannot force an
  -- outcome; they simply hold one vote like everyone else.
  IF b.creator_id = uid THEN
    INSERT INTO public.group_bet_invites (group_bet_id, invited_user_id, status)
      VALUES (_group_bet_id, uid, 'accepted')
      ON CONFLICT (group_bet_id, invited_user_id) DO UPDATE SET status = 'accepted';
    SELECT * INTO invite FROM public.group_bet_invites
      WHERE group_bet_id = _group_bet_id AND invited_user_id = uid FOR UPDATE;
  ELSE
    SELECT * INTO invite FROM public.group_bet_invites
      WHERE group_bet_id = _group_bet_id AND invited_user_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not invited'; END IF;
  END IF;

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
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF sharer_id = uid THEN RAISE EXCEPTION 'You cannot join a bet using your own share link'; END IF;

  IF b.creator_id <> uid THEN
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
  END IF;

  INSERT INTO public.group_bet_invites (group_bet_id, invited_user_id)
    VALUES (_group_bet_id, uid)
    ON CONFLICT (group_bet_id, invited_user_id) DO NOTHING;
END;
$function$;