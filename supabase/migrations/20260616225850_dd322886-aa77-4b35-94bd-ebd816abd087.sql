CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.auto_close_markets()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.markets
  SET status = 'closed'
  WHERE status = 'open' AND closes_at <= now();
$$;

-- Run it once now to clean up any already-expired markets
SELECT public.auto_close_markets();

-- Unschedule prior version if it exists, then schedule fresh
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-markets');
EXCEPTION WHEN OTHERS THEN
  -- job didn't exist; ignore
  NULL;
END $$;

SELECT cron.schedule(
  'auto-close-markets',
  '*/15 * * * *',
  $$SELECT public.auto_close_markets();$$
);