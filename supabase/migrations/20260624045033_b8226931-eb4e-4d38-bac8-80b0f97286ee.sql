
-- Phase 1: AI-Powered Market Discovery
CREATE TYPE public.suggestion_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.market_origin AS ENUM ('user','polymarket_import','ai_suggested');

ALTER TABLE public.markets
  ADD COLUMN created_via public.market_origin NOT NULL DEFAULT 'user';

-- Backfill from existing source column
UPDATE public.markets SET created_via = 'polymarket_import' WHERE source = 'polymarket';

CREATE TABLE public.market_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  suggested_closes_at TIMESTAMPTZ NOT NULL,
  source_summary TEXT,
  status public.suggestion_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_suggestions TO authenticated;
GRANT ALL ON public.market_suggestions TO service_role;

ALTER TABLE public.market_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read suggestions"
  ON public.market_suggestions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update suggestions"
  ON public.market_suggestions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete suggestions"
  ON public.market_suggestions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Inserts only via service role (edge route) — no policy needed for that.

CREATE INDEX market_suggestions_status_idx ON public.market_suggestions(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_market_suggestions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER market_suggestions_touch_updated_at
  BEFORE UPDATE ON public.market_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_market_suggestions_updated_at();

-- Admin-callable RPC to approve a suggestion atomically
CREATE OR REPLACE FUNCTION public.approve_market_suggestion(
  _suggestion_id UUID,
  _title TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _category_id UUID DEFAULT NULL,
  _closes_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  s RECORD;
  new_market_id UUID;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO s FROM public.market_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Already %', s.status; END IF;

  INSERT INTO public.markets (
    creator_id, title, description, category_id, closes_at,
    status, yes_pool, no_pool, volume, created_via
  ) VALUES (
    uid,
    COALESCE(_title, s.title),
    COALESCE(_description, s.description),
    COALESCE(_category_id, s.category_id),
    COALESCE(_closes_at, s.suggested_closes_at),
    'open', 1000, 1000, 0, 'ai_suggested'
  ) RETURNING id INTO new_market_id;

  UPDATE public.market_suggestions
    SET status = 'approved', reviewed_by = uid, reviewed_at = now()
    WHERE id = _suggestion_id;

  RETURN new_market_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_market_suggestion(_suggestion_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.market_suggestions
    SET status = 'rejected', reviewed_by = uid, reviewed_at = now()
    WHERE id = _suggestion_id AND status = 'pending';
END;
$$;
