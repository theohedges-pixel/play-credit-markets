
-- ============================================================
-- PHASE 3: FRIENDSHIPS
-- ============================================================
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own friendships" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);

CREATE OR REPLACE FUNCTION public.send_friend_request(_addressee_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    LIMIT 1;
  IF FOUND THEN
    IF existing.status = 'declined' AND existing.requester_id = uid THEN
      UPDATE public.friendships SET status = 'pending', updated_at = now()
        WHERE id = existing.id RETURNING id INTO fid;
      RETURN fid;
    END IF;
    RAISE EXCEPTION 'Friendship already exists';
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (uid, _addressee_id, 'pending') RETURNING id INTO fid;

  INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (_addressee_id, 'friend_request',
      jsonb_build_object('friendship_id', fid, 'requester_id', uid));
  RETURN fid;
END; $$;

CREATE OR REPLACE FUNCTION public.respond_to_friend_request(_friendship_id UUID, _accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); f RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO f FROM public.friendships WHERE id = _friendship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF f.addressee_id <> uid THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF f.status <> 'pending' THEN RAISE EXCEPTION 'Already responded'; END IF;
  UPDATE public.friendships
    SET status = CASE WHEN _accept THEN 'accepted'::friendship_status ELSE 'declined'::friendship_status END,
        updated_at = now()
    WHERE id = _friendship_id;
  IF _accept THEN
    INSERT INTO public.notifications (user_id, kind, payload)
      VALUES (f.requester_id, 'friend_accepted',
        jsonb_build_object('friendship_id', f.id, 'user_id', uid));
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_friend(_friendship_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); f RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO f FROM public.friendships WHERE id = _friendship_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF uid NOT IN (f.requester_id, f.addressee_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  DELETE FROM public.friendships WHERE id = _friendship_id;
END; $$;

-- ============================================================
-- PHASE 4: NOTIFICATIONS (used by friends + group bets)
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = now() WHERE id = _id AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

-- ============================================================
-- PHASE 4: GROUP BETS
-- ============================================================
CREATE TYPE public.group_bet_status AS ENUM ('open', 'closed', 'resolved');
CREATE TYPE public.group_bet_resolution AS ENUM ('yes', 'no', 'invalid');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE public.group_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  closes_at TIMESTAMPTZ NOT NULL,
  status public.group_bet_status NOT NULL DEFAULT 'open',
  resolution public.group_bet_resolution,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.group_bets TO authenticated;
GRANT ALL ON public.group_bets TO service_role;
ALTER TABLE public.group_bets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_bet_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_bet_id UUID NOT NULL REFERENCES public.group_bets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side public.trade_side NOT NULL,
  credits_wagered NUMERIC NOT NULL CHECK (credits_wagered > 0),
  payout NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_bet_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.group_bet_participants TO authenticated;
GRANT ALL ON public.group_bet_participants TO service_role;
ALTER TABLE public.group_bet_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_bet_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_bet_id UUID NOT NULL REFERENCES public.group_bets(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_bet_id, invited_user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.group_bet_invites TO authenticated;
GRANT ALL ON public.group_bet_invites TO service_role;
ALTER TABLE public.group_bet_invites ENABLE ROW LEVEL SECURITY;

-- RLS for group bets: visible if you created, were invited to, or participate in
CREATE POLICY "View related group bets" ON public.group_bets
  FOR SELECT TO authenticated USING (
    creator_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.group_bet_invites i WHERE i.group_bet_id = id AND i.invited_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_bet_participants p WHERE p.group_bet_id = id AND p.user_id = auth.uid())
  );

CREATE POLICY "View invites for related bets" ON public.group_bet_invites
  FOR SELECT TO authenticated USING (
    invited_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.group_bets b WHERE b.id = group_bet_id AND b.creator_id = auth.uid())
  );

CREATE POLICY "View participants of related bets" ON public.group_bet_participants
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.group_bets b
      WHERE b.id = group_bet_id AND (
        b.creator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.group_bet_invites i WHERE i.group_bet_id = b.id AND i.invited_user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.group_bet_participants p WHERE p.group_bet_id = b.id AND p.user_id = auth.uid())
      )
    )
  );

CREATE INDEX idx_gb_creator ON public.group_bets(creator_id);
CREATE INDEX idx_gbi_user ON public.group_bet_invites(invited_user_id);
CREATE INDEX idx_gbp_user ON public.group_bet_participants(user_id);

-- create_group_bet: creates bet + invites only for accepted friends
CREATE OR REPLACE FUNCTION public.create_group_bet(
  _title TEXT, _description TEXT, _closes_at TIMESTAMPTZ, _friend_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  bet_id UUID;
  fid UUID;
  is_friend BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _title IS NULL OR length(trim(_title)) = 0 THEN RAISE EXCEPTION 'Title required'; END IF;
  IF _closes_at <= now() THEN RAISE EXCEPTION 'Close date must be in the future'; END IF;

  INSERT INTO public.group_bets (creator_id, title, description, closes_at)
    VALUES (uid, _title, _description, _closes_at) RETURNING id INTO bet_id;

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
END; $$;

-- join_group_bet
CREATE OR REPLACE FUNCTION public.join_group_bet(
  _group_bet_id UUID, _side trade_side, _credits NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  IF b.creator_id <> uid THEN
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

  IF invite.id IS NOT NULL THEN
    UPDATE public.group_bet_invites SET status = 'accepted' WHERE id = invite.id;
  END IF;
END; $$;

-- resolve_group_bet: creator only, after close, split proportionally
CREATE OR REPLACE FUNCTION public.resolve_group_bet(
  _group_bet_id UUID, _resolution group_bet_resolution
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
  pot NUMERIC;
  winning_total NUMERIC;
  p RECORD;
  payout NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.group_bets WHERE id = _group_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF b.creator_id <> uid THEN RAISE EXCEPTION 'Only creator can resolve'; END IF;
  IF b.status = 'resolved' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF b.closes_at > now() THEN RAISE EXCEPTION 'Bet has not closed yet'; END IF;

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
      -- no winners, refund everyone
      FOR p IN SELECT * FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id LOOP
        UPDATE public.profiles SET credits = credits + p.credits_wagered WHERE id = p.user_id;
        UPDATE public.group_bet_participants SET payout = p.credits_wagered WHERE id = p.id;
      END LOOP;
    ELSE
      FOR p IN SELECT * FROM public.group_bet_participants
               WHERE group_bet_id = _group_bet_id AND side::text = _resolution::text LOOP
        payout := (p.credits_wagered / winning_total) * pot;
        UPDATE public.profiles SET credits = credits + payout WHERE id = p.user_id;
        UPDATE public.group_bet_participants SET payout = payout WHERE id = p.id;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.group_bets
    SET status = 'resolved', resolution = _resolution, resolved_at = now()
    WHERE id = _group_bet_id;

  -- notify all participants
  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'group_bet_resolved',
      jsonb_build_object('group_bet_id', _group_bet_id, 'title', b.title, 'resolution', _resolution)
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;
END; $$;
