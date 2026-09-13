REVOKE ALL ON FUNCTION public.create_group_bet(text, text, timestamptz, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_bet(text, text, timestamptz, uuid[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.propose_group_bet_resolution(uuid, group_bet_resolution, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_group_bet_resolution(uuid, group_bet_resolution, text) TO authenticated;

REVOKE ALL ON FUNCTION public.flag_auto_resolution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_auto_resolution(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.join_group_bet(uuid, trade_side, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group_bet(uuid, trade_side, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.join_group_bet_via_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group_bet_via_link(uuid, text) TO authenticated;