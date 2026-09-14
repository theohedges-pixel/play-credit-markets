CREATE OR REPLACE FUNCTION public.is_blocked_with(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'blocked'
      AND ((requester_id = auth.uid() AND addressee_id = _other)
        OR (requester_id = _other AND addressee_id = auth.uid()))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_open_group_bets(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM public.group_bets b
  WHERE b.status = 'open'
    AND public.is_group_bet_member(b.id, auth.uid())
    AND public.is_group_bet_member(b.id, _user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.shared_open_group_bets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_open_group_bets(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_bet(_title text, _description text, _closes_at timestamp with time zone, _friend_ids uuid[], _resolution_source text DEFAULT NULL::text)
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

  INSERT INTO public.group_bets (creator_id, title, description, closes_at, resolution_source)
    VALUES (uid, _title, _description, _closes_at, NULLIF(btrim(COALESCE(_resolution_source,'')), ''))
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

  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'blocked'
      AND ((requester_id = uid AND addressee_id = sharer_id)
        OR (requester_id = sharer_id AND addressee_id = uid))
  ) THEN
    RAISE EXCEPTION 'You cannot join this bet because you and the person who shared it have blocked each other';
  END IF;

  IF b.creator_id <> uid AND EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'blocked'
      AND ((requester_id = uid AND addressee_id = b.creator_id)
        OR (requester_id = b.creator_id AND addressee_id = uid))
  ) THEN
    RAISE EXCEPTION 'You cannot join this bet because you and its creator have blocked each other';
  END IF;

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