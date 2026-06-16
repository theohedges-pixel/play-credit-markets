
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS polymarket_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS markets_polymarket_id_key ON public.markets(polymarket_id) WHERE polymarket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS markets_title_lower_idx ON public.markets(lower(title));
ALTER TABLE public.markets ALTER COLUMN creator_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App settings are publicly readable"
  ON public.app_settings FOR SELECT
  USING (true);
