import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Clock, Coins, Lock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  FEATURED_PART,
  PART_DESCRIPTIONS,
  LEVEL_STYLE,
  articleState,
  buildStats,
  learnProgress,
  type LearnAchievement,
  type LearnArticle,
  type LearnAttempt,
} from "@/lib/learn";

export const Route = createFileRoute("/learn/")({
  head: () => ({
    meta: [
      { title: "Learn & earn — Predikt" },
      {
        name: "description",
        content:
          "Thirty short articles on problem gambling, money, markets and risk. Pass the quiz on each and earn credits.",
      },
      { property: "og:title", content: "Learn & earn — Predikt" },
      {
        property: "og:description",
        content: "Read, take the quiz, earn credits. Free courses on risk, money and markets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LearnIndex,
});

function LearnIndex() {
  const { user } = useAuth();

  const articlesQ = useQuery({
    queryKey: ["learn-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learn_articles" as any)
        .select("id, slug, title, summary, part, part_name, level, reward, sort_order, read_minutes, status")
        .eq("status", "published")
        .order("part")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as LearnArticle[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["learn-attempts", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("learn_attempts" as any)
        .select("article_id, attempt_number, score, total, passed, credits_awarded, created_at");
      return ((data ?? []) as unknown) as LearnAttempt[];
    },
  });

  const badgesQ = useQuery({
    queryKey: ["learn-achievements", user?.id],
    queryFn: async () => {
      const [defs, awards] = await Promise.all([
        supabase.from("learn_achievements" as any).select("*").order("sort_order"),
        user
          ? supabase.from("learn_achievement_awards" as any).select("achievement_key, credits_awarded, earned_at")
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return {
        defs: ((defs.data ?? []) as unknown) as LearnAchievement[],
        awards: (awards.data ?? []) as any[],
      };
    },
  });

  const countersQ = useQuery({
    queryKey: ["learn-counters", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("articles_passed, perfect_quizzes, first_attempt_passes")
        .eq("id", user!.id)
        .maybeSingle();
      return (data as any) ?? { articles_passed: 0, perfect_quizzes: 0, first_attempt_passes: 0 };
    },
  });

  const articles = articlesQ.data ?? [];
  const attempts = attemptsQ.data ?? [];
  const counters = countersQ.data ?? {
    articles_passed: 0,
    perfect_quizzes: 0,
    first_attempt_passes: 0,
  };
  const stats = buildStats(articles, attempts, counters);

  const earnedKeys = new Set((badgesQ.data?.awards ?? []).map((a: any) => a.achievement_key));
  const learnCredits =
    attempts.reduce((s, a) => s + (a.credits_awarded ?? 0), 0) +
    (badgesQ.data?.awards ?? []).reduce((s: number, a: any) => s + (a.credits_awarded ?? 0), 0);

  const nextBadge = (badgesQ.data?.defs ?? [])
    .filter((d) => !earnedKeys.has(d.key))
    .map((d) => ({ def: d, ...learnProgress(d.key, stats) }))
    .sort((a, b) => b.current / b.target - a.current / a.target)[0];

  const parts = [...new Set(articles.map((a) => a.part))].sort((a, b) => a - b);

  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="text-primary" />
          <h1 className="font-display text-3xl sm:text-4xl font-bold">Learn &amp; earn</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8 max-w-2xl leading-relaxed">
          Thirty short reads on gambling harm, money, markets and risk. Pass the quiz at the
          end of each one to earn credits — two attempts per article, and you need all but one
          question right.
        </p>

        {user && (
          <div className="rounded-lg border border-border bg-card p-5 mb-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Articles passed
                </div>
                <div className="font-display text-3xl font-bold tabular-nums">
                  {stats.articlesPassed}
                  <span className="text-muted-foreground text-xl"> / {articles.length}</span>
                </div>
              </div>
              <div className="text-right text-xs font-mono text-muted-foreground">
                <div className="flex items-center gap-1 justify-end text-primary">
                  <Coins size={13} /> {learnCredits} credits earned from learning
                </div>
              </div>
            </div>
            {nextBadge && (
              <div className="mt-5">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Next badge: {nextBadge.def.name}</span>
                  <span className="font-mono">
                    {nextBadge.current} / {nextBadge.target}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, (nextBadge.current / nextBadge.target) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {articlesQ.isLoading && <div className="text-muted-foreground text-sm">Loading…</div>}
        {!articlesQ.isLoading && articles.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            The course is being written — check back shortly.
          </div>
        )}

        <div className="space-y-10">
          {parts.map((part) => {
            const inPart = articles.filter((a) => a.part === part);
            const featured = part === FEATURED_PART;
            return (
              <section key={part}>
                <div
                  className={cn(
                    "mb-4",
                    featured && "rounded-lg border border-primary/40 bg-primary/5 p-4",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {featured && <ShieldAlert size={16} className="text-primary" />}
                    <h2 className="font-display text-xl font-bold">
                      Part {part} · {inPart[0]?.part_name}
                    </h2>
                  </div>
                  {PART_DESCRIPTIONS[part] && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {PART_DESCRIPTIONS[part]}
                    </p>
                  )}
                  {featured && (
                    <p className="text-xs text-primary/80 mt-1">
                      Start here — the most important section on Predikt.
                    </p>
                  )}
                </div>

                <div className="grid gap-3">
                  {inPart.map((a) => {
                    const st = articleState(a.id, attempts);
                    return (
                      <Link
                        key={a.id}
                        to="/learn/$slug"
                        params={{ slug: a.slug }}
                        className="block rounded-lg border border-border bg-card p-4 hover:border-foreground/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-semibold leading-snug">{a.title}</div>
                            <p className="text-sm text-muted-foreground mt-1 leading-snug">
                              {a.summary}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] font-mono">
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 uppercase tracking-wide",
                                  LEVEL_STYLE[a.level],
                                )}
                              >
                                {a.level}
                              </span>
                              <span className="flex items-center gap-1 text-primary">
                                <Coins size={12} />+{a.reward}
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock size={12} />
                                {a.read_minutes} min
                              </span>
                            </div>
                          </div>
                          {user && (
                            <div className="shrink-0 text-[11px] font-mono text-right">
                              {st.passed ? (
                                <span className="flex items-center gap-1 text-primary">
                                  <CheckCircle2 size={13} /> Passed
                                </span>
                              ) : st.attemptsLeft === 0 ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Lock size={12} /> No attempts left
                                </span>
                              ) : st.attemptsUsed > 0 ? (
                                <span className="text-amber-400">
                                  Attempts used {st.attemptsUsed} of 2
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not started</span>
                              )}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {!user && articles.length > 0 && (
          <p className="text-sm text-muted-foreground mt-10">
            <Link to="/signup" className="text-primary hover:underline">
              Create a free account
            </Link>{" "}
            to take the quizzes and earn credits.
          </p>
        )}
      </div>
    </div>
  );
}
