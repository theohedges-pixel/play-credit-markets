ALTER TABLE public.market_suggestions
  ADD COLUMN IF NOT EXISTS suggested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_text text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS suggested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS markets_suggested_by_idx ON public.markets (suggested_by) WHERE suggested_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_suggestions_suggested_by_idx ON public.market_suggestions (suggested_by);

DROP POLICY IF EXISTS "Users read their own suggestions" ON public.market_suggestions;
CREATE POLICY "Users read their own suggestions"
  ON public.market_suggestions FOR SELECT TO authenticated
  USING (suggested_by = auth.uid());

DROP FUNCTION IF EXISTS public.approve_market_suggestion(uuid, text, text, uuid, timestamptz);
CREATE FUNCTION public.approve_market_suggestion(
  _suggestion_id uuid,
  _title text DEFAULT NULL,
  _description text DEFAULT NULL,
  _category_id uuid DEFAULT NULL,
  _closes_at timestamptz DEFAULT NULL,
  _probability numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  s RECORD;
  new_market_id UUID;
  p NUMERIC;
  v_yes NUMERIC;
  v_no NUMERIC;
  v_title TEXT;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO s FROM public.market_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Already %', s.status; END IF;

  -- Starting odds come from the reviewed estimate; pools mirror the AI
  -- generator's seeding so trading behaves identically to any other market.
  p := COALESCE(_probability, 0.5);
  IF p <= 0.01 THEN p := 0.01; END IF;
  IF p >= 0.99 THEN p := 0.99; END IF;
  v_yes := GREATEST(round(2000 * (1 - p)), 50);
  v_no := GREATEST(round(2000 * p), 50);
  v_title := COALESCE(_title, s.title);

  INSERT INTO public.markets (
    creator_id, suggested_by, title, description, category_id, closes_at,
    status, yes_pool, no_pool, volume, created_via
  ) VALUES (
    uid,
    s.suggested_by,
    v_title,
    COALESCE(_description, s.description),
    COALESCE(_category_id, s.category_id),
    COALESCE(_closes_at, s.suggested_closes_at),
    'open', v_yes, v_no, 0,
    CASE WHEN s.suggested_by IS NULL THEN 'ai_suggested' ELSE 'user' END
  ) RETURNING id INTO new_market_id;

  INSERT INTO public.price_history (market_id, yes_price)
  VALUES (new_market_id, v_no / (v_yes + v_no));

  UPDATE public.market_suggestions
    SET status = 'approved', reviewed_by = uid, reviewed_at = now()
    WHERE id = _suggestion_id;

  IF s.suggested_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      s.suggested_by,
      'suggestion_approved',
      jsonb_build_object('market_id', new_market_id, 'title', v_title)
    );
  END IF;

  RETURN new_market_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.reject_market_suggestion(uuid);
CREATE FUNCTION public.reject_market_suggestion(_suggestion_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  s RECORD;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO s FROM public.market_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Already %', s.status; END IF;
  IF s.suggested_by IS NOT NULL AND COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting a user suggestion';
  END IF;

  UPDATE public.market_suggestions
    SET status = 'rejected', reviewed_by = uid, reviewed_at = now(),
        rejection_reason = NULLIF(btrim(_reason), '')
    WHERE id = _suggestion_id;

  IF s.suggested_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      s.suggested_by,
      'suggestion_rejected',
      jsonb_build_object('title', s.title, 'reason', btrim(_reason))
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_market_suggestion(uuid, text, text, uuid, timestamptz, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_market_suggestion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_market_suggestion(uuid, text, text, uuid, timestamptz, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_market_suggestion(uuid, text) TO authenticated;