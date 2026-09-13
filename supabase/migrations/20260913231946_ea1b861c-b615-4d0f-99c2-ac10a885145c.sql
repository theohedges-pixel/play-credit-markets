ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS polymarket_event_id text,
  ADD COLUMN IF NOT EXISTS polymarket_event_slug text,
  ADD COLUMN IF NOT EXISTS polymarket_neg_risk_id text,
  ADD COLUMN IF NOT EXISTS group_item_title text;

CREATE INDEX IF NOT EXISTS markets_polymarket_event_id_idx
  ON public.markets (polymarket_event_id)
  WHERE polymarket_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_prunable_markets()
RETURNS TABLE(id uuid, title text, created_at timestamp with time zone, closes_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH candidate AS (
    SELECT m.id, m.title, m.created_at, m.closes_at, m.polymarket_event_id
    FROM public.markets m
    WHERE m.status = 'open'
      AND (m.created_via = 'polymarket_import' OR m.source = 'polymarket')
      AND m.volume = 0
      AND NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.market_id = m.id)
  ),
  -- An event is prunable only when every open market in it is a candidate;
  -- otherwise pruning part of it would re-create the partial-outcome problem.
  event_state AS (
    SELECT m.polymarket_event_id AS eid,
           count(*) AS total,
           count(c.id) AS prunable
    FROM public.markets m
    LEFT JOIN candidate c ON c.id = m.id
    WHERE m.polymarket_event_id IS NOT NULL
      AND m.status = 'open'
    GROUP BY m.polymarket_event_id
  )
  SELECT c.id, c.title, c.created_at, c.closes_at
  FROM candidate c
  LEFT JOIN event_state e ON e.eid = c.polymarket_event_id
  WHERE c.polymarket_event_id IS NULL
     OR e.total = 1
     OR e.total = e.prunable
  ORDER BY c.created_at ASC;
END;
$$;