CREATE OR REPLACE FUNCTION public.approve_market_suggestion(_suggestion_id uuid, _title text DEFAULT NULL::text, _description text DEFAULT NULL::text, _category_id uuid DEFAULT NULL::uuid, _closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _probability numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    (CASE WHEN s.suggested_by IS NULL THEN 'ai_suggested' ELSE 'user' END)::market_origin
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