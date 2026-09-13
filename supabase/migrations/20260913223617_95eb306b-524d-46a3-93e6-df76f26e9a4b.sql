
DROP POLICY IF EXISTS "Published articles are public" ON public.learn_articles;
CREATE POLICY "Published articles are public" ON public.learn_articles
  FOR SELECT USING (status = 'published');
CREATE POLICY "Admins read all articles" ON public.learn_articles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
