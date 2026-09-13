ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS peak_net_worth numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.user_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier numeric NOT NULL,
  reached_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tier)
);

GRANT SELECT ON public.user_milestones TO anon, authenticated;
GRANT ALL ON public.user_milestones TO service_role;
ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "milestones readable by all" ON public.user_milestones FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.milestone_tiers()
RETURNS numeric[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[5000,10000,50000,250000,500000,1000000,5000000,25000000,50000000,100000000,500000000,1000000000]::numeric[];
$$;

-- Same formula as the leaderboard_net_worth view: cash + value of open positions.
CREATE OR REPLACE FUNCTION public.current_net_worth(_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.credits + COALESCE((
    SELECT sum(
      pos.yes_shares * (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0))
      + pos.no_shares * (1 - (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0)))
    )
    FROM positions pos
    JOIN markets m ON m.id = pos.market_id
    WHERE pos.user_id = p.id AND m.status = 'open'
  ), 0)
  FROM profiles p WHERE p.id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_peak_net_worth(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nw numeric;
  old_peak numeric;
  t numeric;
  top_new numeric := NULL;
BEGIN
  SELECT public.current_net_worth(_user_id) INTO nw;
  IF nw IS NULL THEN RETURN jsonb_build_object('net_worth', 0, 'new_tier', NULL); END IF;

  SELECT peak_net_worth INTO old_peak FROM profiles WHERE id = _user_id FOR UPDATE;
  IF old_peak IS NULL THEN RETURN jsonb_build_object('net_worth', nw, 'new_tier', NULL); END IF;

  IF nw > old_peak THEN
    UPDATE profiles SET peak_net_worth = nw WHERE id = _user_id;
    FOREACH t IN ARRAY public.milestone_tiers() LOOP
      IF nw >= t AND old_peak < t THEN
        INSERT INTO user_milestones (user_id, tier) VALUES (_user_id, t)
        ON CONFLICT (user_id, tier) DO NOTHING;
        top_new := t;
      END IF;
    END LOOP;
    IF top_new IS NOT NULL THEN
      INSERT INTO notifications (user_id, kind, payload)
      VALUES (_user_id, 'milestone_reached', jsonb_build_object('tier', top_new, 'net_worth', nw));
    END IF;
  END IF;

  RETURN jsonb_build_object('net_worth', nw, 'new_tier', top_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_all_peak_net_worth()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM profiles LOOP
    PERFORM public.sync_peak_net_worth(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Trigger points: credits change (trades, payouts, daily/learning/referral claims)
-- and any position change all funnel through these two tables.
CREATE OR REPLACE FUNCTION public.trg_peak_from_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    PERFORM public.sync_peak_net_worth(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS peak_net_worth_on_credits ON public.profiles;
CREATE TRIGGER peak_net_worth_on_credits
AFTER UPDATE OF credits ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_peak_from_profile();

CREATE OR REPLACE FUNCTION public.trg_peak_from_position()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_peak_net_worth(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS peak_net_worth_on_position ON public.positions;
CREATE TRIGGER peak_net_worth_on_position
AFTER INSERT OR UPDATE OR DELETE ON public.positions
FOR EACH ROW EXECUTE FUNCTION public.trg_peak_from_position();

DROP VIEW IF EXISTS public.leaderboard_net_worth;
CREATE VIEW public.leaderboard_net_worth AS
SELECT p.id, p.username, p.avatar_url, p.credits,
  COALESCE(pv.position_value, 0::numeric) AS position_value,
  (p.credits + COALESCE(pv.position_value, 0::numeric)) AS net_worth,
  p.peak_net_worth,
  p.created_at
FROM profiles p
LEFT JOIN LATERAL (
  SELECT sum(
    pos.yes_shares * (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0::numeric))
    + pos.no_shares * (1::numeric - (m.no_pool / NULLIF(m.yes_pool + m.no_pool, 0::numeric)))
  ) AS position_value
  FROM positions pos
  JOIN markets m ON m.id = pos.market_id
  WHERE pos.user_id = p.id AND m.status = 'open'::market_status
) pv ON true;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT id, username, avatar_url, bio, peak_net_worth, created_at FROM profiles;

GRANT SELECT ON public.leaderboard_net_worth TO anon, authenticated;
GRANT SELECT ON public.public_profiles TO anon, authenticated;