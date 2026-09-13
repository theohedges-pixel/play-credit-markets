CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reward_credited BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referred_id),
  CONSTRAINT referrals_referred_unique UNIQUE (referred_id)
);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_id);

-- Signup: honour referrer username in metadata, grant bonus credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INT := 0;
  ref_username TEXT;
  ref_id UUID;
  start_credits NUMERIC := 1000;
BEGIN
  base_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    split_part(NEW.email, '@', 1),
    'trader'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF base_username = '' THEN base_username := 'trader'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;

  ref_username := regexp_replace(lower(COALESCE(NEW.raw_user_meta_data->>'referrer_username', '')), '[^a-z0-9_]', '', 'g');
  IF ref_username <> '' THEN
    SELECT id INTO ref_id FROM public.profiles WHERE username = ref_username;
    IF ref_id IS NOT NULL AND ref_id <> NEW.id THEN
      start_credits := 1250;
    ELSE
      ref_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, username, credits)
  VALUES (NEW.id, final_username, start_credits);

  IF ref_id IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id)
    VALUES (ref_id, NEW.id)
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Called by the signed-in invitee; pays the inviter once the invitee's email is confirmed.
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
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('credited', false); END IF;

  SELECT * INTO r FROM public.referrals
    WHERE referred_id = uid AND reward_credited = false FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('credited', false); END IF;

  SELECT email_confirmed_at INTO confirmed FROM auth.users WHERE id = uid;
  IF confirmed IS NULL THEN RETURN jsonb_build_object('credited', false); END IF;

  UPDATE public.profiles SET credits = credits + 200 WHERE id = r.referrer_id;
  UPDATE public.referrals SET reward_credited = true WHERE id = r.id;

  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (r.referrer_id, 'referral_reward',
    jsonb_build_object('referred_id', uid, 'credits', 200));

  RETURN jsonb_build_object('credited', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_referral_reward() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward() TO authenticated;