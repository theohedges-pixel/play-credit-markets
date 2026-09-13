INSERT INTO public.app_settings (key, value)
VALUES ('cron_secret', to_jsonb(encode(gen_random_bytes(24), 'hex')))
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "App settings are publicly readable" ON public.app_settings;
CREATE POLICY "App settings are publicly readable" ON public.app_settings
  FOR SELECT USING (key <> 'cron_secret');

CREATE UNIQUE INDEX IF NOT EXISTS markets_polymarket_id_key
  ON public.markets (polymarket_id) WHERE polymarket_id IS NOT NULL;

SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname IN ('discover-trending-markets-6h','generate-ai-markets-4h');

SELECT cron.schedule('discover-trending-markets-6h', '0 */6 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--0b45ad2f-911c-4379-b3bf-8d332f5b5faf.lovable.app/api/public/hooks/discover-trending-markets',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'cron_secret')),
    body := '{}'::jsonb
  ) AS request_id;
$cmd$);

SELECT cron.schedule('generate-ai-markets-4h', '0 */4 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--0b45ad2f-911c-4379-b3bf-8d332f5b5faf.lovable.app/api/public/hooks/generate-ai-markets',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'cron_secret')),
    body := '{}'::jsonb
  ) AS request_id;
$cmd$);