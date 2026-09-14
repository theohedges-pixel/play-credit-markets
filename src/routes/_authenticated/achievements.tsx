import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BookOpen, Gem, Lock } from "lucide-react";
import {
  buildStats,
  learnProgress,
  type LearnAchievement,
  type LearnAttempt,
} from "@/lib/learn";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { useNetWorth } from "@/lib/use-net-worth";
import { fmtCredits } from "@/lib/format";
import { MILESTONE_TIERS, TIER_COPY, nextTier, tierLabel, tierStyle } from "@/lib/milestones";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements — Predikt" },
      {
        name: "description",
        content:
          "Track your lifetime wealth milestones on Predikt, from 5K to 1B credits of peak net worth.",
      },
      { property: "og:title", content: "Achievements — Predikt" },
      {
        property: "og:description",
        content: "Track your lifetime wealth milestones on Predikt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Achievements,
});

function Achievements() {
  const { user } = useAuth();
  const { data: standing } = useNetWorth();

  const { data: earned } = useQuery({
    queryKey: ["milestones", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_milestones")
        .select("tier, reached_at")
        .eq("user_id", user!.id);
      const map = new Map<number, string>();
      (data ?? []).forEach((r: any) => map.set(Number(r.tier), r.reached_at));
      return map;
    },
  });

  const peak = standing?.peak_net_worth ?? 0;
  const upcoming = nextTier(peak);
  const previous = [...MILESTONE_TIERS].reverse().find((t) => peak >= t) ?? 0;
  const progress = upcoming
    ? Math.max(0, Math.min(100, ((peak - previous) / (upcoming - previous)) * 100))
    : 100;

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Gem className="text-primary" />
          <h1 className="font-display text-4xl font-bold">Achievements</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">
          Wealth milestones are awarded on your lifetime peak net worth — cash plus
          open positions. Once earned, a badge is yours for good.
        </p>

        <div className="rounded-lg border border-border bg-card p-5 mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Peak net worth
              </div>
              <div className="font-display text-3xl font-bold tabular-nums">
                {fmtCredits(peak)}
              </div>
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground">
              <div>{fmtCredits(standing?.net_worth ?? 0)} now</div>
              <div>
                {fmtCredits(standing?.credits ?? 0)}c cash ·{" "}
                {fmtCredits(standing?.position_value ?? 0)}c in positions
              </div>
            </div>
          </div>
          {upcoming && (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Next: {tierLabel(upcoming)}</span>
                <span className="font-mono">
                  {fmtCredits(Math.max(0, upcoming - peak))} to go
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MILESTONE_TIERS.map((tier) => {
            const at = earned?.get(tier);
            const style = tierStyle(tier);
            const copy = TIER_COPY[tier];
            const isNext = !at && tier === upcoming;
            const nextPct =
              isNext && upcoming
                ? Math.max(0, Math.min(100, (peak / tier) * 100))
                : 0;
            return (
              <div
                key={tier}
                className={cn(
                  "relative rounded-lg border p-4 flex flex-col gap-1.5",
                  at
                    ? style.className
                    : "border-border bg-card text-muted-foreground grayscale opacity-60",
                  at && style.glow && "shadow-[0_0_20px_-8px_currentColor]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl font-bold">{tierLabel(tier)}</span>
                  {at ? (
                    <Gem size={18} className="shrink-0" />
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-mono">
                      <Lock size={12} /> Locked
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-foreground">{copy.name}</div>
                <p className="text-xs leading-snug">{copy.description}</p>
                <div className="text-[11px] font-mono mt-auto pt-1">
                  {at
                    ? `Reached ${format(new Date(at), "d MMM yyyy")}`
                    : `${fmtCredits(tier)} credits`}
                </div>
                {isNext && (
                  <div className="mt-1.5">
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span>
                        {fmtCredits(peak)} / {tierLabel(tier)}
                      </span>
                      <span>{Math.floor(nextPct)}% there</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${nextPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Chasing the next tier?{" "}
          <Link to="/markets" className="text-primary hover:underline">
            Find a market
          </Link>
          .
        </p>

        <LearningBadges />
      </div>
    </div>
  );
}

function LearningBadges() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["learn-badges-page", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [defs, awards, articles, attempts, profile] = await Promise.all([
        (supabase as any).from("learn_achievements").select("*").order("category").order("sort_order"),
        (supabase as any).from("learn_achievement_awards").select("achievement_key, earned_at"),
        (supabase as any).from("learn_articles").select("id, part").eq("status", "published"),
        (supabase as any).from("learn_attempts").select("article_id, attempt_number, score, total, passed, credits_awarded, created_at"),
        (supabase as any)
          .from("profiles")
          .select("articles_passed, perfect_quizzes, first_attempt_passes")
          .eq("id", user!.id)
          .maybeSingle(),
      ]);
      return {
        defs: (defs.data ?? []) as LearnAchievement[],
        awards: new Map<string, string>(
          ((awards.data ?? []) as any[]).map((a) => [a.achievement_key, a.earned_at]),
        ),
        stats: buildStats(
          (articles.data ?? []) as any[],
          ((attempts.data ?? []) as unknown) as LearnAttempt[],
          (profile.data as any) ?? {
            articles_passed: 0,
            perfect_quizzes: 0,
            first_attempt_passes: 0,
          },
        ),
      };
    },
  });

  if (!data?.defs.length) return null;

  const locked = data.defs.filter((d) => !data.awards.has(d.key));
  const nearest = locked
    .map((d) => ({ key: d.key, ...learnProgress(d.key, data.stats) }))
    .sort((a, b) => b.current / b.target - a.current / a.target)[0];

  return (
    <div className="mt-14">
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="text-primary" size={22} />
        <h2 className="font-display text-2xl font-bold">Learning</h2>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Earned by reading{" "}
        <Link to="/learn" className="text-primary hover:underline">
          the course
        </Link>{" "}
        and passing the quizzes. Each badge pays credits once.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.defs.map((d) => {
          const at = data.awards.get(d.key);
          const p = learnProgress(d.key, data.stats);
          const isNext = !at && nearest?.key === d.key;
          const pct = Math.max(0, Math.min(100, (p.current / p.target) * 100));
          const featured = d.key === "risk_aware";
          return (
            <div
              key={d.key}
              className={cn(
                "relative rounded-lg border p-4 flex flex-col gap-1.5",
                at
                  ? featured
                    ? "border-primary bg-primary/10 text-primary shadow-[0_0_24px_-8px_currentColor]"
                    : "border-primary/40 bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground grayscale opacity-60",
                featured && "sm:col-span-2",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-bold">{d.name}</span>
                {at ? (
                  <BookOpen size={18} className="shrink-0" />
                ) : (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-mono">
                    <Lock size={12} /> Locked
                  </span>
                )}
              </div>
              <p className="text-xs leading-snug">{d.requirement}</p>
              <div className="text-[11px] font-mono mt-auto pt-1">
                {at ? `Earned ${format(new Date(at), "d MMM yyyy")}` : `+${d.credits} credits`}
              </div>
              {isNext && (
                <div className="mt-1.5">
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span>
                      {p.current} / {p.target}
                    </span>
                    <span>{Math.floor(pct)}% there</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
