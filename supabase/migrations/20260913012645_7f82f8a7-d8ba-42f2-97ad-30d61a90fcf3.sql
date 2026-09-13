CREATE OR REPLACE VIEW public.leaderboard_net_worth
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  p.credits,
  COALESCE(pv.position_value, 0::numeric) AS position_value,
  p.credits + COALESCE(pv.position_value, 0::numeric) AS net_worth,
  p.created_at
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT sum(
    pos.yes_shares * (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0::numeric))
    + pos.no_shares * (1::numeric - m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0::numeric))
  ) AS position_value
  FROM public.positions pos
  JOIN public.markets m ON m.id = pos.market_id
  WHERE pos.user_id = p.id
    AND m.status = 'open'::public.market_status
) pv ON true;

GRANT SELECT ON public.leaderboard_net_worth TO authenticated;
GRANT SELECT ON public.leaderboard_net_worth TO anon;
GRANT ALL ON public.leaderboard_net_worth TO service_role;