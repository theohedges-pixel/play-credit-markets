CREATE TABLE public.market_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX market_themes_category_name_idx ON public.market_themes (category_id, lower(name));

GRANT SELECT ON public.market_themes TO anon, authenticated;
GRANT ALL ON public.market_themes TO service_role;
ALTER TABLE public.market_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "themes readable by all" ON public.market_themes FOR SELECT USING (true);
CREATE POLICY "admins manage themes" ON public.market_themes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.market_theme_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  theme_id uuid NOT NULL REFERENCES public.market_themes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, theme_id)
);
CREATE INDEX market_theme_tags_theme_idx ON public.market_theme_tags (theme_id);
CREATE INDEX market_theme_tags_market_idx ON public.market_theme_tags (market_id);

GRANT SELECT ON public.market_theme_tags TO anon, authenticated;
GRANT ALL ON public.market_theme_tags TO service_role;
ALTER TABLE public.market_theme_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "theme tags readable by all" ON public.market_theme_tags FOR SELECT USING (true);
CREATE POLICY "admins manage theme tags" ON public.market_theme_tags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));