INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES ('52c0e4d0-0348-48d9-bac3-9c84e75e0044','20ea092c-b5c5-4fb5-8cb3-2686c958aff0','accepted')
ON CONFLICT DO NOTHING;

INSERT INTO public.group_bets (id, creator_id, title, closes_at, status)
VALUES ('11111111-1111-1111-1111-111111111111','52c0e4d0-0348-48d9-bac3-9c84e75e0044','ZZ block test bet', now() + interval '10 days', 'open');

INSERT INTO public.group_bet_invites (group_bet_id, invited_user_id, status)
VALUES ('11111111-1111-1111-1111-111111111111','20ea092c-b5c5-4fb5-8cb3-2686c958aff0','accepted');