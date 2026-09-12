import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { UserAvatar } from "@/components/UserAvatar";
import { fmtCredits } from "@/lib/format";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Predikt" }] }),
  component: Leaderboard,
});

function Leaderboard() {
  const { data: traders, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leaderboard_net_worth")
        .select("id, username, avatar_url, credits, position_value, net_worth")
        .order("net_worth", { ascending: false })
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
        <p className="text-muted-foreground text-sm mb-8">Top traders by credit balance.</p>
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
            : traders?.map((t: any, i) => (
                <Link
                  key={t.id}
                  to="/users/$username"
                  params={{ username: t.username }}
                  className="px-5 py-4 flex items-center justify-between hover:bg-secondary/30 transition"
                >
                  <div className="flex items-center gap-4">
                    <span className={`font-display font-bold w-6 text-right ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
                    <UserAvatar username={t.username} avatarUrl={t.avatar_url} userId={t.id} size="md" />
                    <span className="font-medium">@{t.username}</span>
                  </div>
                  <span className="font-mono tabular-nums">{fmtCredits(t.credits)}c</span>
                </Link>
              ))}
        </div>
      </div>
    </div>
  );
}
