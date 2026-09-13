-- ============ TABLES ============
CREATE OR REPLACE FUNCTION public.touch_learn_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TABLE public.learn_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  part int NOT NULL,
  part_name text NOT NULL,
  level text NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
  reward int NOT NULL DEFAULT 10,
  sort_order int NOT NULL DEFAULT 0,
  read_minutes int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('published','draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.learn_articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learn_articles TO authenticated;
GRANT ALL ON public.learn_articles TO service_role;
ALTER TABLE public.learn_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published articles are public" ON public.learn_articles
  FOR SELECT USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert articles" ON public.learn_articles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update articles" ON public.learn_articles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete articles" ON public.learn_articles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_learn_articles_updated_at BEFORE UPDATE ON public.learn_articles
  FOR EACH ROW EXECUTE FUNCTION public.touch_learn_updated_at();

CREATE TABLE public.learn_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.learn_articles(id) ON DELETE CASCADE,
  question_set text NOT NULL CHECK (question_set IN ('A','B')),
  sort_order int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option_id text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learn_questions TO authenticated;
GRANT ALL ON public.learn_questions TO service_role;
ALTER TABLE public.learn_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read questions" ON public.learn_questions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write questions" ON public.learn_questions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX learn_questions_article_set_idx ON public.learn_questions(article_id, question_set, sort_order);
CREATE TRIGGER update_learn_questions_updated_at BEFORE UPDATE ON public.learn_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_learn_updated_at();

CREATE TABLE public.learn_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.learn_articles(id) ON DELETE CASCADE,
  attempt_number int NOT NULL CHECK (attempt_number IN (1,2)),
  question_set text NOT NULL CHECK (question_set IN ('A','B')),
  score int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  credits_awarded int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_id, attempt_number)
);
GRANT SELECT ON public.learn_attempts TO authenticated;
GRANT ALL ON public.learn_attempts TO service_role;
ALTER TABLE public.learn_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own attempts" ON public.learn_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.learn_achievements (
  key text PRIMARY KEY,
  name text NOT NULL,
  requirement text NOT NULL,
  credits int NOT NULL DEFAULT 0,
  category text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.learn_achievements TO anon, authenticated;
GRANT ALL ON public.learn_achievements TO service_role;
ALTER TABLE public.learn_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievement definitions are public" ON public.learn_achievements FOR SELECT USING (true);

CREATE TABLE public.learn_achievement_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.learn_achievements(key) ON DELETE CASCADE,
  credits_awarded int NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);
GRANT SELECT ON public.learn_achievement_awards TO authenticated;
GRANT ALL ON public.learn_achievement_awards TO service_role;
ALTER TABLE public.learn_achievement_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own learn awards" ON public.learn_achievement_awards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS articles_passed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfect_quizzes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_attempt_passes int NOT NULL DEFAULT 0;

-- ============ ACHIEVEMENT DEFINITIONS ============
INSERT INTO public.learn_achievements (key, name, requirement, credits, category, sort_order) VALUES
  ('first_lesson','First Lesson','Pass 1 article quiz',10,'completion',1),
  ('getting_started','Getting Started','Pass 5 article quizzes',15,'completion',2),
  ('committed_learner','Committed Learner','Pass 10 article quizzes',30,'completion',3),
  ('halfway_there','Halfway There','Pass 15 article quizzes',50,'completion',4),
  ('scholar','Scholar','Pass 25 article quizzes',75,'completion',5),
  ('graduate','Graduate','Pass all 30 article quizzes',150,'completion',6),
  ('risk_aware','Risk Aware','Pass every article in Part 1',40,'section',1),
  ('money_smart','Money Smart','Pass every article in Part 2',40,'section',2),
  ('market_mechanic','Market Mechanic','Pass every article in Part 3',40,'section',3),
  ('prudent_investor','Prudent Investor','Pass every article in Part 4',40,'section',4),
  ('risk_manager','Risk Manager','Pass every article in Part 5',25,'section',5),
  ('student_of_greats','Student of the Greats','Pass every article in Part 6',25,'section',6),
  ('perfect_score','Perfect Score','Score 100% on any quiz',15,'performance',1),
  ('flawless_five','Flawless Five','Score 100% on 5 different quizzes',50,'performance',2),
  ('first_time_every_time','First Time Every Time','Pass 10 articles on the first attempt',60,'performance',3);

-- ============ ACHIEVEMENT CHECK ============
CREATE OR REPLACE FUNCTION public.check_learn_achievements(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_passed int;
  v_perfect int;
  v_first int;
  v_total_articles int;
  v_new jsonb := '[]'::jsonb;
  r record;
  v_ok boolean;
  v_part int;
BEGIN
  SELECT articles_passed, perfect_quizzes, first_attempt_passes
    INTO v_passed, v_perfect, v_first
  FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN v_new; END IF;

  SELECT count(*) INTO v_total_articles FROM public.learn_articles WHERE status = 'published';

  FOR r IN SELECT * FROM public.learn_achievements ORDER BY category, sort_order LOOP
    IF EXISTS (SELECT 1 FROM public.learn_achievement_awards a
               WHERE a.user_id = _user_id AND a.achievement_key = r.key) THEN
      CONTINUE;
    END IF;

    v_ok := false;
    CASE r.key
      WHEN 'first_lesson' THEN v_ok := v_passed >= 1;
      WHEN 'getting_started' THEN v_ok := v_passed >= 5;
      WHEN 'committed_learner' THEN v_ok := v_passed >= 10;
      WHEN 'halfway_there' THEN v_ok := v_passed >= 15;
      WHEN 'scholar' THEN v_ok := v_passed >= 25;
      WHEN 'graduate' THEN v_ok := v_total_articles > 0 AND v_passed >= v_total_articles;
      WHEN 'perfect_score' THEN v_ok := v_perfect >= 1;
      WHEN 'flawless_five' THEN v_ok := v_perfect >= 5;
      WHEN 'first_time_every_time' THEN v_ok := v_first >= 10;
      ELSE
        v_part := CASE r.key
          WHEN 'risk_aware' THEN 1 WHEN 'money_smart' THEN 2 WHEN 'market_mechanic' THEN 3
          WHEN 'prudent_investor' THEN 4 WHEN 'risk_manager' THEN 5 WHEN 'student_of_greats' THEN 6
          ELSE NULL END;
        IF v_part IS NOT NULL THEN
          SELECT count(*) FILTER (WHERE art.id IS NOT NULL) > 0
             AND count(*) FILTER (WHERE art.id IS NOT NULL) = count(*) FILTER (WHERE pa.article_id IS NOT NULL)
            INTO v_ok
          FROM public.learn_articles art
          LEFT JOIN LATERAL (
            SELECT DISTINCT t.article_id FROM public.learn_attempts t
            WHERE t.user_id = _user_id AND t.article_id = art.id AND t.passed
          ) pa ON true
          WHERE art.part = v_part AND art.status = 'published';
        END IF;
    END CASE;

    IF v_ok THEN
      INSERT INTO public.learn_achievement_awards (user_id, achievement_key, credits_awarded)
      VALUES (_user_id, r.key, r.credits)
      ON CONFLICT (user_id, achievement_key) DO NOTHING;

      IF FOUND THEN
        UPDATE public.profiles SET credits = credits + r.credits WHERE id = _user_id;
        INSERT INTO public.notifications (user_id, kind, payload)
        VALUES (_user_id, 'learn_achievement',
                jsonb_build_object('key', r.key, 'name', r.name, 'credits', r.credits));
        v_new := v_new || jsonb_build_object('key', r.key, 'name', r.name, 'credits', r.credits);
      END IF;
    END IF;
  END LOOP;

  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.check_learn_achievements(uuid) FROM PUBLIC, anon;

-- ============ START ATTEMPT ============
CREATE OR REPLACE FUNCTION public.start_learn_attempt(_article_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used int;
  v_attempt int;
  v_set text;
  v_questions jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learn_articles WHERE id = _article_id AND status = 'published') THEN
    RAISE EXCEPTION 'Article not available';
  END IF;

  SELECT count(*) INTO v_used FROM public.learn_attempts
   WHERE user_id = v_user AND article_id = _article_id;
  IF v_used >= 2 THEN RAISE EXCEPTION 'No attempts remaining for this article'; END IF;
  IF EXISTS (SELECT 1 FROM public.learn_attempts WHERE user_id = v_user AND article_id = _article_id AND passed) THEN
    RAISE EXCEPTION 'You have already passed this quiz';
  END IF;

  v_attempt := v_used + 1;
  v_set := CASE WHEN v_attempt = 1 THEN 'A' ELSE 'B' END;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', q.options)
                            ORDER BY q.sort_order), '[]'::jsonb)
    INTO v_questions
  FROM public.learn_questions q
  WHERE q.article_id = _article_id AND q.question_set = v_set;

  IF jsonb_array_length(v_questions) = 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', q.options)
                              ORDER BY q.sort_order), '[]'::jsonb)
      INTO v_questions
    FROM public.learn_questions q
    WHERE q.article_id = _article_id AND q.question_set = 'A';
    v_set := 'A';
  END IF;

  IF jsonb_array_length(v_questions) = 0 THEN RAISE EXCEPTION 'This quiz has no questions yet'; END IF;

  RETURN jsonb_build_object('attempt_number', v_attempt, 'question_set', v_set, 'questions', v_questions);
END;
$$;
REVOKE ALL ON FUNCTION public.start_learn_attempt(uuid) FROM PUBLIC, anon;

-- ============ SUBMIT ATTEMPT ============
CREATE OR REPLACE FUNCTION public.submit_learn_attempt(_article_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used int;
  v_attempt int;
  v_set text;
  v_reward int;
  v_score int := 0;
  v_total int := 0;
  v_passed boolean;
  v_already_passed boolean;
  v_credits int := 0;
  v_review jsonb := '[]'::jsonb;
  v_new jsonb;
  q record;
  v_selected text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT reward INTO v_reward FROM public.learn_articles
   WHERE id = _article_id AND status = 'published';
  IF v_reward IS NULL THEN RAISE EXCEPTION 'Article not available'; END IF;

  SELECT count(*) INTO v_used FROM public.learn_attempts
   WHERE user_id = v_user AND article_id = _article_id;
  IF v_used >= 2 THEN RAISE EXCEPTION 'No attempts remaining for this article'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.learn_attempts
                  WHERE user_id = v_user AND article_id = _article_id AND passed)
    INTO v_already_passed;
  IF v_already_passed THEN RAISE EXCEPTION 'You have already passed this quiz'; END IF;

  v_attempt := v_used + 1;
  v_set := CASE WHEN v_attempt = 1 THEN 'A' ELSE 'B' END;
  IF NOT EXISTS (SELECT 1 FROM public.learn_questions WHERE article_id = _article_id AND question_set = v_set) THEN
    v_set := 'A';
  END IF;

  FOR q IN
    SELECT * FROM public.learn_questions
     WHERE article_id = _article_id AND question_set = v_set
     ORDER BY sort_order
  LOOP
    v_total := v_total + 1;
    SELECT a->>'selected_option_id' INTO v_selected
      FROM jsonb_array_elements(_answers) a
     WHERE a->>'question_id' = q.id::text
     LIMIT 1;

    IF v_selected IS NOT NULL AND v_selected = q.correct_option_id THEN
      v_score := v_score + 1;
    END IF;

    v_review := v_review || jsonb_build_object(
      'question_id', q.id,
      'prompt', q.prompt,
      'options', q.options,
      'selected_option_id', v_selected,
      'correct_option_id', q.correct_option_id,
      'correct', coalesce(v_selected = q.correct_option_id, false),
      'explanation', q.explanation
    );
  END LOOP;

  IF v_total = 0 THEN RAISE EXCEPTION 'This quiz has no questions yet'; END IF;

  v_passed := v_score >= v_total - 1;

  IF v_passed THEN
    v_credits := v_reward;
    UPDATE public.profiles
       SET credits = credits + v_credits,
           articles_passed = articles_passed + 1,
           perfect_quizzes = perfect_quizzes + CASE WHEN v_score = v_total THEN 1 ELSE 0 END,
           first_attempt_passes = first_attempt_passes + CASE WHEN v_attempt = 1 THEN 1 ELSE 0 END
     WHERE id = v_user;
  END IF;

  INSERT INTO public.learn_attempts
    (user_id, article_id, attempt_number, question_set, score, total, passed, credits_awarded)
  VALUES (v_user, _article_id, v_attempt, v_set, v_score, v_total, v_passed, v_credits);

  v_new := public.check_learn_achievements(v_user);

  RETURN jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'passed', v_passed,
    'attempt_number', v_attempt,
    'attempts_remaining', 2 - v_attempt,
    'credits_awarded', v_credits,
    'achievements', v_new,
    'review', v_review
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_learn_attempt(uuid, jsonb) FROM PUBLIC, anon;

-- ============ ADMIN HELPERS ============
CREATE OR REPLACE FUNCTION public.admin_learn_articles()
RETURNS TABLE(
  id uuid, slug text, title text, summary text, part int, part_name text, level text,
  reward int, sort_order int, read_minutes int, status text,
  questions_a bigint, questions_b bigint, passes bigint, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.slug, a.title, a.summary, a.part, a.part_name, a.level, a.reward,
         a.sort_order, a.read_minutes, a.status,
         (SELECT count(*) FROM public.learn_questions q WHERE q.article_id = a.id AND q.question_set = 'A'),
         (SELECT count(*) FROM public.learn_questions q WHERE q.article_id = a.id AND q.question_set = 'B'),
         (SELECT count(DISTINCT t.user_id) FROM public.learn_attempts t WHERE t.article_id = a.id AND t.passed),
         a.updated_at
  FROM public.learn_articles a
  WHERE public.require_admin() IS NOT NULL
  ORDER BY a.part, a.sort_order, a.title;
$$;
REVOKE ALL ON FUNCTION public.admin_learn_articles() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.admin_log_learn_action(_action text, _article_id uuid, _details jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := public.require_admin();
  INSERT INTO public.admin_audit_log (admin_id, action, target_id, details)
  VALUES (v_admin, _action, _article_id, coalesce(_details, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_log_learn_action(text, uuid, jsonb) FROM PUBLIC, anon;
