import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { UserAvatar } from "@/components/UserAvatar";
import { TierBadge } from "@/components/TierBadge";
import { fmtCredits } from "@/lib/format";
import { Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Predikt" },
      { name: "description", content: "See the top Predikt traders ranked by net worth." },
      { property: "og:title", content: "Leaderboard — Predikt" },
      { property: "og:description", content: "See the top Predikt traders ranked by net worth." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const { user } = useAuth();
  const { data: traders, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leaderboard_net_worth")
        .select("id, username, avatar_url, credits, position_value, net_worth, peak_net_worth, created_at")
        .order("net_worth", { ascending: false })
        .order("created_at", { ascending: true })
        .order("username", { ascending: true })
        .limit(50);
      return data ?? [];
    },
  });

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="text-primary" />
          <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">Top traders by net worth — cash plus the value of open positions.</p>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-4 bg-secondary rounded" />
                    <div className="h-4 w-32 bg-secondary rounded" />
                  </div>
                  <div className="h-4 w-16 bg-secondary rounded" />
                </div>
              ))
            : traders?.map((t: any, i: number) => (
                <Link
                  key={t.id}
                  to="/users/$username"
                  params={{ username: t.username }}
                  className={`px-5 py-4 flex items-center justify-between border-l-2 transition ${
                    t.id === user?.id
                      ? "border-l-primary bg-primary/10 hover:bg-primary/15"
                      : "border-l-transparent hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`font-display font-bold w-6 text-right ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
                    <UserAvatar username={t.username} avatarUrl={t.avatar_url} userId={t.id} size="md" />
                    <span className="font-medium">@{t.username}</span>
                    <TierBadge peakNetWorth={t.peak_net_worth} />
                    {t.id === user?.id && (
                      <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">you</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono tabular-nums">{fmtCredits(t.net_worth)}c</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {fmtCredits(t.credits)} cash · {fmtCredits(t.position_value)} positions
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </div>
  );
}
