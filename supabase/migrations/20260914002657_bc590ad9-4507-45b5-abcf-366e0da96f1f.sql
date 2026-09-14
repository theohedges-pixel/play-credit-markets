CREATE OR REPLACE FUNCTION public.search_users(_q text)
RETURNS TABLE(id uuid, username text, avatar_url text, rel text, friendship_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _q IS NULL OR length(btrim(_q)) < 2 THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_url,
    CASE
      WHEN f.id IS NULL THEN 'none'
      WHEN f.status = 'accepted' THEN 'friends'
      WHEN f.status = 'pending' AND f.requester_id = uid THEN 'sent'
      WHEN f.status = 'pending' THEN 'incoming'
      ELSE 'none'
    END AS rel,
    f.id AS friendship_id
  FROM public.profiles p
  LEFT JOIN public.friendships f
    ON (f.requester_id = uid AND f.addressee_id = p.id)
    OR (f.requester_id = p.id AND f.addressee_id = uid)
  WHERE p.id <> uid
    AND p.username ILIKE '%' || btrim(_q) || '%'
    AND (f.id IS NULL OR f.status <> 'blocked')
    AND NOT (f.status = 'declined' AND f.requester_id = uid AND f.decline_count >= 2)
  ORDER BY (lower(p.username) = lower(btrim(_q))) DESC, length(p.username), p.username
  LIMIT 20;
END; $$;

REVOKE ALL ON FUNCTION public.search_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_friend_request(_addressee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid UUID := auth.uid();
  fid UUID;
  existing RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF uid = _addressee_id THEN RAISE EXCEPTION 'Cannot friend yourself'; END IF;

  SELECT * INTO existing FROM public.friendships
    WHERE (requester_id = uid AND addressee_id = _addressee_id)
       OR (requester_id = _addressee_id AND addressee_id = uid)
    LIMIT 1
    FOR UPDATE;

  IF FOUND THEN
    IF existing.status = 'blocked' THEN
      RAISE EXCEPTION 'You can no longer send this person a request';
    ELSIF existing.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends';
    ELSIF existing.status = 'pending' AND existing.requester_id = uid THEN
      RAISE EXCEPTION 'Your request is still pending';
    ELSIF existing.status = 'pending' THEN
      RAISE EXCEPTION 'They have already sent you a request — accept it in your Requests tab';
    ELSIF existing.status = 'declined' AND existing.requester_id = uid THEN
      IF existing.decline_count >= 2 THEN
        RAISE EXCEPTION 'This person has declined your request twice, so you cannot send another';
      END IF;
      UPDATE public.friendships SET status = 'pending', updated_at = now()
        WHERE id = existing.id RETURNING id INTO fid;
    ELSE
      -- we declined them previously; we may now initiate our own request
      UPDATE public.friendships
        SET requester_id = uid, addressee_id = _addressee_id,
            status = 'pending', decline_count = 0, updated_at = now()
        WHERE id = existing.id RETURNING id INTO fid;
    END IF;
  ELSE
    INSERT INTO public.friendships (requester_id, addressee_id, status)
      VALUES (uid, _addressee_id, 'pending') RETURNING id INTO fid;
  END IF;

  INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (_addressee_id, 'friend_request',
      jsonb_build_object('friendship_id', fid, 'requester_id', uid));
  RETURN fid;
END; $$;

CREATE OR REPLACE FUNCTION public.respond_to_friend_request(_friendship_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid UUID := auth.uid(); f RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO f FROM public.friendships WHERE id = _friendship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF f.addressee_id <> uid THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF f.status <> 'pending' THEN RAISE EXCEPTION 'Already responded'; END IF;

  UPDATE public.friendships
    SET status = CASE WHEN _accept THEN 'accepted'::friendship_status ELSE 'declined'::friendship_status END,
        decline_count = CASE WHEN _accept THEN decline_count ELSE decline_count + 1 END,
        updated_at = now()
    WHERE id = _friendship_id;

  IF _accept THEN
    INSERT INTO public.notifications (user_id, kind, payload)
      VALUES (f.requester_id, 'friend_accepted',
        jsonb_build_object('friendship_id', f.id, 'user_id', uid));
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.block_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF uid = _user_id THEN RAISE EXCEPTION 'Cannot block yourself'; END IF;

  DELETE FROM public.friendships
    WHERE (requester_id = uid AND addressee_id = _user_id)
       OR (requester_id = _user_id AND addressee_id = uid);

  INSERT INTO public.friendships (requester_id, addressee_id, status, blocked_by)
    VALUES (uid, _user_id, 'blocked'::friendship_status, uid);
END; $$;

CREATE OR REPLACE FUNCTION public.unblock_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.friendships
    WHERE status = 'blocked'::friendship_status
      AND blocked_by = uid
      AND ((requester_id = uid AND addressee_id = _user_id)
        OR (requester_id = _user_id AND addressee_id = uid));
END; $$;

REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;