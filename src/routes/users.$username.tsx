import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { UserAvatar } from "@/components/UserAvatar";
import { fmtCredits, yesPrice } from "@/lib/format";

export const Route = createFileRoute("/users/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Predikt` },
      { name: "description", content: `Predikt profile for @${params.username}` },
    ],
  }),
  component: PublicProfile,
});

function PublicProfile() {
  const { username } = Route.useParams();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, username, credits, avatar_url, bio, created_at")
        .eq("username", username)
        .maybeSingle();
      return data as {
        id: string;
        username: string;
        credits: number;
        avatar_url: string | null;
        bio: string | null;
        created_at: string;
      } | null;
    },
  });

  const uid = profile?.id;

  const { data: positions } = useQuery({
    queryKey: ["public-positions", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("positions")
        .select("yes_shares, no_shares, credits_spent, market:markets(id, status, resolution, yes_pool, no_pool)")
        .eq("user_id", uid!);
      return data ?? [];
    },
  });

  const { data: marketsCreated } = useQuery({
    queryKey: ["public-markets-created", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { count } = await supabase
        .from("markets")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", uid!);
      return count ?? 0;
    },
  });

  const { data: trades } = useQuery({
    queryKey: ["public-trades", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("trades")
        .select("id, side, action, shares, credits, price, created_at, market:markets(id, title)")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  if (isLoading || !profile) {
    return (
      <div>
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-10 animate-pulse">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-24 w-24 rounded-full bg-secondary" />
            <div className="space-y-2">
              <div className="h-6 w-40 bg-secondary rounded" />
              <div className="h-3 w-32 bg-secondary rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compute net worth
  let posValue = 0;
  let resolvedTotal = 0;
  let resolvedWins = 0;
  (positions ?? []).forEach((p: any) => {
    if (!p.market) return;
    const price = yesPrice(Number(p.market.yes_pool), Number(p.market.no_pool));
    posValue += Number(p.yes_shares) * price + Number(p.no_shares) * (1 - price);
    if (p.market.status === "resolved") {
      resolvedTotal++;
      const won =
        (p.market.resolution === "yes" && Number(p.yes_shares) > 0) ||
        (p.market.resolution === "no" && Number(p.no_shares) > 0);
      if (won) resolvedWins++;
    }
  });
  const netWorth = Number(profile.credits) + posValue;
  const winRate = resolvedTotal > 0 ? (resolvedWins / resolvedTotal) * 100 : null;

  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-start gap-5 mb-8 flex-wrap">
          <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} userId={profile.id} size="xl" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold">@{profile.username}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Member since {format(new Date(profile.created_at), "MMMM yyyy")}
            </p>
            {profile.bio && <p className="mt-3 text-sm max-w-xl">{profile.bio}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Stat label="Net worth" value={`${fmtCredits(netWorth)}c`} />
          <Stat
            label="Win rate"
            value={winRate === null ? "—" : `${winRate.toFixed(0)}%`}
            hint={resolvedTotal > 0 ? `${resolvedWins}/${resolvedTotal}` : "No resolved"}
          />
          <Stat label="Markets created" value={String(marketsCreated ?? 0)} />
          <Stat label="Open positions" value={String(positions?.length ?? 0)} />
        </div>

        <h2 className="font-display text-xl font-semibold mb-4">Recent activity</h2>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {trades && trades.length > 0 ? (
            trades.map((t: any) => (
              <Link
                key={t.id}
                to="/markets/$id"
                params={{ id: t.market?.id ?? "" }}
                className="block px-5 py-3 hover:bg-secondary/30 transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{t.market?.title ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-mono uppercase ${t.side === "yes" ? "text-yes" : "text-no"}`}>
                      {t.side}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {fmtCredits(Number(t.credits))}c
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No trades yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
