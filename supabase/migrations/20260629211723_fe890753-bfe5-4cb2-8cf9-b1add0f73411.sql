-- Tighten public SELECT policies to authenticated users
DROP POLICY IF EXISTS "trades readable by all" ON public.trades;
CREATE POLICY "trades readable by authenticated" ON public.trades FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "positions readable by all" ON public.positions;
CREATE POLICY "positions readable by authenticated" ON public.positions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles readable by all" ON public.profiles;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles readable by all" ON public.user_roles;
CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- market_suggestions: server/admin-only feature; add explicit admin-only INSERT policy
DROP POLICY IF EXISTS "admins insert suggestions" ON public.market_suggestions;
CREATE POLICY "admins insert suggestions" ON public.market_suggestions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Revoke EXECUTE on every SECURITY DEFINER function in public from anon (and PUBLIC), preserving authenticated access
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Drop redundant authenticated-read policy on avatars; bucket will be made public via storage_update_bucket
DROP POLICY IF EXISTS "Avatars are readable by authenticated users" ON storage.objects;