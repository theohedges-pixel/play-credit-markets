DELETE FROM public.group_bet_invites WHERE group_bet_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM public.group_bet_participants WHERE group_bet_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM public.group_bets WHERE id = '11111111-1111-1111-1111-111111111111';

DELETE FROM public.friendships
WHERE (requester_id = '52c0e4d0-0348-48d9-bac3-9c84e75e0044' AND addressee_id = '20ea092c-b5c5-4fb5-8cb3-2686c958aff0')
   OR (requester_id = '20ea092c-b5c5-4fb5-8cb3-2686c958aff0' AND addressee_id = '52c0e4d0-0348-48d9-bac3-9c84e75e0044');

INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES ('52c0e4d0-0348-48d9-bac3-9c84e75e0044','20ea092c-b5c5-4fb5-8cb3-2686c958aff0','accepted');