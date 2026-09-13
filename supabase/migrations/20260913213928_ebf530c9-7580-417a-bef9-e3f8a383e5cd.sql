ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS claim_streak integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.claim_daily_credits()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  last_claim DATE;
  streak INTEGER;
  base NUMERIC := 5;
  bonus NUMERIC := 0;
  new_credits NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT last_daily_claim, COALESCE(claim_streak, 0)
    INTO last_claim, streak
    FROM public.profiles WHERE id = uid FOR UPDATE;

  IF last_claim = current_date THEN
    RAISE EXCEPTION 'Already claimed today';
  END IF;

  -- Consecutive day continues the streak; anything else starts a new one.
  IF last_claim = current_date - 1 THEN
    streak := streak + 1;
  ELSE
    streak := 1;
  END IF;

  -- Repeatable: every 30th consecutive day pays an extra 50 credits.
  IF streak % 30 = 0 THEN
    bonus := 50;
  END IF;

  UPDATE public.profiles
    SET credits = credits + base + bonus,
        last_daily_claim = current_date,
        claim_streak = streak
    WHERE id = uid
    RETURNING credits INTO new_credits;

  IF bonus > 0 THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (uid, 'streak_bonus', jsonb_build_object('streak', streak, 'bonus', bonus, 'base', base));
  END IF;

  PERFORM public.sync_peak_net_worth(uid);

  RETURN jsonb_build_object(
    'credits', new_credits,
    'claimed', base,
    'bonus', bonus,
    'streak', streak,
    'bonus_granted', bonus > 0
  );
END;
$function$;