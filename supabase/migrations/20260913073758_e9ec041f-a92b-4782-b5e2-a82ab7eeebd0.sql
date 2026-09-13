DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, username, avatar_url, bio, created_at FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT SELECT ON public.public_profiles TO service_role;