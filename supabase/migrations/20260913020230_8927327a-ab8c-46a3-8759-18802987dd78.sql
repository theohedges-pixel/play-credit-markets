-- lovable-cron-fallback-reviewed: 96 runs/day; the AI outcome check must fire shortly after a bet's close time so participants see a proposed result while it is still fresh; hourly would delay it up to an hour.
ALTER TABLE public.group_bets ADD COLUMN IF NOT EXISTS auto_checked_at timestamptz;

SELECT cron.schedule('check-group-bet-outcomes', '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0b45ad2f-911c-4379-b3bf-8d332f5b5faf.lovable.app/api/public/hooks/check-group-bet-outcomes',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$);