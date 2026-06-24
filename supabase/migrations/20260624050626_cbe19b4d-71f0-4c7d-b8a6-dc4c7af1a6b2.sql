
CREATE OR REPLACE FUNCTION public.resolve_group_bet(
  _group_bet_id UUID, _resolution group_bet_resolution
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
  pot NUMERIC;
  winning_total NUMERIC;
  p RECORD;
  _pay NUMERIC;
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
    SET status = 'resolved', resolution = _resolution, resolved_at = now()
    WHERE id = _group_bet_id;

  INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'group_bet_resolved',
      jsonb_build_object('group_bet_id', _group_bet_id, 'title', b.title, 'resolution', _resolution)
    FROM public.group_bet_participants WHERE group_bet_id = _group_bet_id;
END; $$;
