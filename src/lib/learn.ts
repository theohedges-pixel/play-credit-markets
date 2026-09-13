export type LearnLevel = "basic" | "intermediate" | "advanced";

export interface LearnArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body?: string;
  part: number;
  part_name: string;
  level: LearnLevel;
  reward: number;
  sort_order: number;
  read_minutes: number;
  status: "published" | "draft";
}

export interface LearnAttempt {
  article_id: string;
  attempt_number: number;
  score: number;
  total: number;
  passed: boolean;
  credits_awarded: number;
  created_at: string;
}

export interface LearnAchievement {
  key: string;
  name: string;
  requirement: string;
  credits: number;
  category: "completion" | "section" | "performance";
  sort_order: number;
}

export const LEVEL_STYLE: Record<LearnLevel, string> = {
  basic: "border-primary/40 bg-primary/10 text-primary",
  intermediate: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  advanced: "border-violet-400/40 bg-violet-400/10 text-violet-400",
};

export const LEVEL_REWARD: Record<LearnLevel, number> = {
  basic: 10,
  intermediate: 20,
  advanced: 50,
};

/** The part the platform most wants people to read. */
export const FEATURED_PART = 1;

export interface LearnStats {
  articlesPassed: number;
  perfectQuizzes: number;
  firstAttemptPasses: number;
  totalArticles: number;
  /** part number -> [passed, total] among published articles */
  byPart: Map<number, [number, number]>;
}

const SECTION_PART: Record<string, number> = {
  risk_aware: 1,
  money_smart: 2,
  market_mechanic: 3,
  prudent_investor: 4,
  risk_manager: 5,
  student_of_greats: 6,
};

/** Current progress toward an achievement, for the locked-badge progress bars. */
export function learnProgress(
  key: string,
  s: LearnStats,
): { current: number; target: number } {
  switch (key) {
    case "first_lesson":
      return { current: s.articlesPassed, target: 1 };
    case "getting_started":
      return { current: s.articlesPassed, target: 5 };
    case "committed_learner":
      return { current: s.articlesPassed, target: 10 };
    case "halfway_there":
      return { current: s.articlesPassed, target: 15 };
    case "scholar":
      return { current: s.articlesPassed, target: 25 };
    case "graduate":
      return { current: s.articlesPassed, target: s.totalArticles || 30 };
    case "perfect_score":
      return { current: s.perfectQuizzes, target: 1 };
    case "flawless_five":
      return { current: s.perfectQuizzes, target: 5 };
    case "first_time_every_time":
      return { current: s.firstAttemptPasses, target: 10 };
    default: {
      const part = SECTION_PART[key];
      if (!part) return { current: 0, target: 1 };
      const [passed, total] = s.byPart.get(part) ?? [0, 0];
      return { current: passed, target: total || 1 };
    }
  }
}

export function buildStats(
  articles: Pick<LearnArticle, "id" | "part">[],
  attempts: LearnAttempt[],
  counters: { articles_passed: number; perfect_quizzes: number; first_attempt_passes: number },
): LearnStats {
  const passedIds = new Set(attempts.filter((a) => a.passed).map((a) => a.article_id));
  const byPart = new Map<number, [number, number]>();
  for (const a of articles) {
    const cur = byPart.get(a.part) ?? [0, 0];
    cur[1] += 1;
    if (passedIds.has(a.id)) cur[0] += 1;
    byPart.set(a.part, cur);
  }
  return {
    articlesPassed: counters.articles_passed ?? 0,
    perfectQuizzes: counters.perfect_quizzes ?? 0,
    firstAttemptPasses: counters.first_attempt_passes ?? 0,
    totalArticles: articles.length,
    byPart,
  };
}

export interface ArticleState {
  passed: boolean;
  attemptsUsed: number;
  attemptsLeft: number;
}

export function articleState(articleId: string, attempts: LearnAttempt[]): ArticleState {
  const mine = attempts.filter((a) => a.article_id === articleId);
  const passed = mine.some((a) => a.passed);
  return {
    passed,
    attemptsUsed: mine.length,
    attemptsLeft: passed ? 0 : Math.max(0, 2 - mine.length),
  };
}
