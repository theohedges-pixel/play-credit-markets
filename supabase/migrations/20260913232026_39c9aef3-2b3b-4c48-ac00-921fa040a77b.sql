ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS polymarket_event_title text;