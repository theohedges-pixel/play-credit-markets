import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Gem, Lock } from "lucide-react";
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
                {fmtCredits(standing?.credits ?? 0)} cash ·{" "}
                {fmtCredits(standing?.position_value ?? 0)} positions
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
      </div>
    </div>
  );
}
