
-- Learning modules: videos + quizzes about responsible play / not getting addicted to gambling
CREATE TABLE public.learning_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('video','quiz')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  video_url TEXT,
  min_watch_seconds INT NOT NULL DEFAULT 0,
  questions JSONB,
  pass_threshold INT NOT NULL DEFAULT 0,
  reward INT NOT NULL DEFAULT 100,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.learning_modules TO anon, authenticated;
GRANT ALL ON public.learning_modules TO service_role;
ALTER TABLE public.learning_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_modules readable by all" ON public.learning_modules FOR SELECT USING (true);

CREATE TABLE public.learning_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.learning_modules(id) ON DELETE CASCADE,
  score INT,
  credits_awarded INT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);
GRANT SELECT, INSERT ON public.learning_completions TO authenticated;
GRANT ALL ON public.learning_completions TO service_role;
ALTER TABLE public.learning_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own completions" ON public.learning_completions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RPC to atomically claim a reward
CREATE OR REPLACE FUNCTION public.claim_learning_reward(_module_id UUID, _score INT)
RETURNS TABLE (credits_awarded INT, new_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _m public.learning_modules%ROWTYPE;
  _award INT;
  _bal NUMERIC;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _m FROM public.learning_modules WHERE id = _module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module not found'; END IF;

  IF _m.kind = 'quiz' THEN
    IF _score IS NULL OR _score < _m.pass_threshold THEN
      RAISE EXCEPTION 'Score % below passing threshold %', _score, _m.pass_threshold;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.learning_completions WHERE user_id = _uid AND module_id = _module_id) THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;

  _award := _m.reward;
  INSERT INTO public.learning_completions(user_id, module_id, score, credits_awarded)
    VALUES (_uid, _module_id, _score, _award);
  UPDATE public.profiles SET credits = credits + _award WHERE id = _uid RETURNING credits INTO _bal;

  credits_awarded := _award;
  new_balance := _bal;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_learning_reward(UUID, INT) TO authenticated;
