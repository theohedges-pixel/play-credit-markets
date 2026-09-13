ALTER TYPE public.group_bet_status ADD VALUE IF NOT EXISTS 'voting';
ALTER TYPE public.group_bet_status ADD VALUE IF NOT EXISTS 'pending_auto_resolution';

ALTER TABLE public.group_bets
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS resolution_source text,
  ADD COLUMN IF NOT EXISTS auto_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposed_resolution public.group_bet_resolution,
  ADD COLUMN IF NOT EXISTS auto_resolution_deadline timestamptz;

CREATE TABLE IF NOT EXISTS public.group_bet_resolution_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_bet_id uuid NOT NULL REFERENCES public.group_bets(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_resolution public.group_bet_resolution NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_bet_id, voter_id)
);

GRANT SELECT ON public.group_bet_resolution_votes TO authenticated;
GRANT ALL ON public.group_bet_resolution_votes TO service_role;

ALTER TABLE public.group_bet_resolution_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read resolution votes" ON public.group_bet_resolution_votes;
CREATE POLICY "members read resolution votes"
  ON public.group_bet_resolution_votes
  FOR SELECT TO authenticated
  USING (public.is_group_bet_member(group_bet_id, auth.uid()));

-- updated_at is maintained by the resolution RPCs.