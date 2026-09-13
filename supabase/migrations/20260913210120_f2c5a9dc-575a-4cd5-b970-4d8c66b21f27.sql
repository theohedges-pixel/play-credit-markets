REVOKE EXECUTE ON FUNCTION public.sync_peak_net_worth(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_all_peak_net_worth() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.current_net_worth(uuid) FROM anon, authenticated, public;