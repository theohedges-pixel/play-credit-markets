
DO $$
DECLARE secret TEXT;
BEGIN
  SELECT (value #>> '{}') INTO secret FROM public.app_settings WHERE key = 'cron_secret';
  IF secret IS NULL THEN RAISE EXCEPTION 'cron_secret missing'; END IF;

  PERFORM cron.unschedule('resolve-ai-markets-hourly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resolve-ai-markets-hourly');

  PERFORM cron.schedule(
    'resolve-ai-markets-hourly',
    '23 * * * *',
    format(
      $j$SELECT net.http_post(
        url := 'https://project--0b45ad2f-911c-4379-b3bf-8d332f5b5faf.lovable.app/api/public/hooks/resolve-ai-markets',
        headers := %L::jsonb,
        body := '{}'::jsonb) AS request_id;$j$,
      jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret)::text
    )
  );
END $$;
