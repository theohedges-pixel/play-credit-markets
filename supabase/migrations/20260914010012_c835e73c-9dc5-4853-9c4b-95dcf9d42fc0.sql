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
    AND COALESCE(f.status <> 'blocked', true)
    AND NOT COALESCE(f.status = 'declined' AND f.requester_id = uid AND f.decline_count >= 2, false)
  ORDER BY (lower(p.username) = lower(btrim(_q))) DESC, length(p.username), p.username
  LIMIT 20;
END; $$;

REVOKE ALL ON FUNCTION public.search_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;