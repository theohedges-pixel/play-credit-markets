REVOKE ALL ON FUNCTION public.get_market_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_activity(uuid, integer) TO authenticated;