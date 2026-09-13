DROP POLICY IF EXISTS "positions readable by authenticated" ON public.positions;
CREATE POLICY "users read own positions"
ON public.positions FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "trades readable by authenticated" ON public.trades;
CREATE POLICY "users read own trades"
ON public.trades FOR SELECT TO authenticated
USING (user_id = auth.uid());