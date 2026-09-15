ALTER TABLE public.group_bets
  ADD COLUMN IF NOT EXISTS stake numeric;

ALTER TABLE public.group_bets
  DROP CONSTRAINT IF EXISTS group_bets_stake_positive;
ALTER TABLE public.group_bets
  ADD CONSTRAINT group_bets_stake_positive CHECK (stake IS NULL OR stake > 0);

CREATE OR REPLACE FUNCTION public.create_group_bet(_title text, _description text, _closes_at timestamp with time zone, _friend_ids uuid[], _resolution_source text DEFAULT NULL::text, _stake numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF _stake IS NOT NULL AND _stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;

  INSERT INTO public.group_bets (creator_id, title, description, closes_at, resolution_source, stake)
    VALUES (uid, _title, _description, _closes_at, NULLIF(btrim(COALESCE(_resolution_source,'')), ''), _stake)
    RETURNING id INTO bet_id;

  FOREACH fid IN ARRAY COALESCE(_friend_ids, ARRAY[]::UUID[]) LOOP
    IF fid = uid THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'blocked'
        AND ((requester_id = uid AND addressee_id = fid) OR (requester_id = fid AND addressee_id = uid))
    ) THEN
      RAISE EXCEPTION 'You cannot invite someone you have blocked or who has blocked you';
    END IF;

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

-- Everyone stakes the same amount when the creator set one.
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
  amt NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group bet not found'; END IF;
  IF b.status <> 'open' THEN RAISE EXCEPTION 'Bet not open'; END IF;
  IF b.closes_at <= now() THEN RAISE EXCEPTION 'Bet has closed'; END IF;

  amt := COALESCE(b.stake, _credits);
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Credits must be positive'; END IF;
  IF b.stake IS NOT NULL AND _credits IS NOT NULL AND _credits <> b.stake THEN
    RAISE EXCEPTION 'Everyone stakes the same amount on this bet: % credits', b.stake;
  END IF;

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
  IF user_credits < amt THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  UPDATE public.profiles SET credits = credits - amt WHERE id = uid;
  INSERT INTO public.group_bet_participants (group_bet_id, user_id, side, credits_wagered)
    VALUES (_group_bet_id, uid, _side, amt);

  UPDATE public.group_bet_invites SET status = 'accepted' WHERE id = invite.id;
END;
$function$;