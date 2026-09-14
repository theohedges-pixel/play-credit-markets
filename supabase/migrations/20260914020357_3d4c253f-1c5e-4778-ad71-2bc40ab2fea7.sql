CREATE OR REPLACE FUNCTION public.claim_referral_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  confirmed TIMESTAMPTZ;
  r RECORD;
  total_credited INTEGER;
  bonus INTEGER := 0;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('credited', false); END IF;

  SELECT * INTO r FROM public.referrals
    WHERE referred_id = uid AND reward_credited = false FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('credited', false); END IF;

  SELECT email_confirmed_at INTO confirmed FROM auth.users WHERE id = uid;
  IF confirmed IS NULL THEN RETURN jsonb_build_object('credited', false); END IF;

  UPDATE public.referrals SET reward_credited = true WHERE id = r.id;

  SELECT count(*) INTO total_credited FROM public.referrals
    WHERE referrer_id = r.referrer_id AND reward_credited = true;

  IF total_credited % 20 = 0 THEN bonus := 100; END IF;

  UPDATE public.profiles SET credits = credits + 10 + bonus WHERE id = r.referrer_id;

  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (r.referrer_id, 'referral_reward',
    jsonb_build_object('referred_id', uid, 'credits', 10, 'bonus', bonus, 'total_referrals', total_credited));

  RETURN jsonb_build_object('credited', true, 'credits', 10, 'bonus', bonus);
END;
$function$;