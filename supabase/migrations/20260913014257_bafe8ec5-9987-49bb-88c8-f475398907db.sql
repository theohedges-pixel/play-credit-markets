CREATE OR REPLACE FUNCTION public.get_public_group_bet_preview(_group_bet_id uuid)
RETURNS TABLE(id uuid, title text, description text, closes_at timestamptz, creator_username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT b.id, b.title, b.description, b.closes_at, p.username
  FROM public.group_bets b
  JOIN public.profiles p ON p.id = b.creator_id
  WHERE b.id = _group_bet_id
    AND b.status = 'open'
    AND b.closes_at > now();
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_group_bet_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_group_bet_preview(uuid) TO anon, authenticated;

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

  IF sharer_id = uid THEN
    RAISE EXCEPTION 'You cannot join a bet using your own share link';
  END IF;

  -- A shared link is treated as mutual consent: form (or upgrade) a friendship.
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

REVOKE EXECUTE ON FUNCTION public.join_group_bet_via_link(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group_bet_via_link(uuid, text) TO authenticated;