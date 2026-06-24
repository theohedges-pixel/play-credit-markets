
CREATE OR REPLACE FUNCTION public.is_group_bet_member(_bet_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_bets b WHERE b.id = _bet_id AND b.creator_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.group_bet_invites WHERE group_bet_id = _bet_id AND invited_user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.group_bet_participants WHERE group_bet_id = _bet_id AND user_id = _user_id);
$$;

DROP POLICY IF EXISTS "View related group bets" ON public.group_bets;
CREATE POLICY "View related group bets" ON public.group_bets FOR SELECT TO authenticated
  USING (public.is_group_bet_member(id, auth.uid()));

DROP POLICY IF EXISTS "View invites for related bets" ON public.group_bet_invites;
CREATE POLICY "View invites for related bets" ON public.group_bet_invites FOR SELECT TO authenticated
  USING (invited_user_id = auth.uid() OR public.is_group_bet_member(group_bet_id, auth.uid()));

DROP POLICY IF EXISTS "View participants of related bets" ON public.group_bet_participants;
CREATE POLICY "View participants of related bets" ON public.group_bet_participants FOR SELECT TO authenticated
  USING (public.is_group_bet_member(group_bet_id, auth.uid()));
