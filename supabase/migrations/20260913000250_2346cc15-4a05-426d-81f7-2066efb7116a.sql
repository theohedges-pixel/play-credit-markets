-- Remove overly permissive write access for regular authenticated users
DROP POLICY IF EXISTS "authenticated create markets" ON public.markets;
DROP POLICY IF EXISTS "creator or admin updates market" ON public.markets;

CREATE POLICY "admins create markets"
ON public.markets FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update markets"
ON public.markets FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Sanity constraint on pool values
ALTER TABLE public.markets
  ADD CONSTRAINT markets_pools_positive
  CHECK (yes_pool > 0 AND no_pool > 0 AND volume >= 0);