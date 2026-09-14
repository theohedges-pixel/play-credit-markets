ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS upstream_outcome_count integer,
  ADD COLUMN IF NOT EXISTS event_mutually_exclusive boolean;