import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Lock } from "lucide-react";
import { fmtCredits, fmtPct } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { UserAvatar } from "@/components/UserAvatar";
import { TierBadge } from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

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
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("public_profiles")
        .select("id, username, avatar_url, bio, peak_net_worth, trading_history_public, created_at")
        .eq("username", username)
        .maybeSingle();
      return data as {
        id: string;
        username: string;
        avatar_url: string | null;
        bio: string | null;
        peak_net_worth: number | null;
        trading_history_public: boolean | null;
        created_at: string;
      } | null;
    },
  });

  const uid = profile?.id;
  const isOwnProfile = !!me && me.id === uid;

  // Trading history visibility is enforced in exactly one place — the
  // get_public_trading_history function — which honours each user's opt-out
  // and always lets a user see their own data.
  const { data: tradingHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["public-trading-history", uid, me?.id],
    enabled: !!uid && !!me,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_public_trading_history", {
        _user_id: uid,
      });
      if (error) throw error;
      return data as {
        visible: boolean;
        trades: any[];
        positions: any[];
      };
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

  const { data: friendCount } = useQuery({
    queryKey: ["public-friend-count", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      return count ?? 0;
    },
  });

  const { data: friendship, refetch: refetchFriendship } = useQuery({
    queryKey: ["friendship-with", me?.id, uid],
    enabled: !!me && !!uid && me.id !== uid,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${me!.id},addressee_id.eq.${uid}),and(requester_id.eq.${uid},addressee_id.eq.${me!.id})`,
        )
        .maybeSingle();
      return data as
        | { id: string; status: "pending" | "accepted" | "declined"; requester_id: string; addressee_id: string }
        | null;
    },
  });

  const sendRequest = async () => {
    if (!uid) return;
    const { error } = await supabase.rpc("send_friend_request" as any, { _addressee_id: uid });
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    refetchFriendship();
  };

  const acceptRequest = async () => {
    if (!friendship) return;
    const { error } = await supabase.rpc("respond_to_friend_request" as any, {
      _friendship_id: friendship.id,
      _accept: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Friends!");
    refetchFriendship();
    qc.invalidateQueries({ queryKey: ["public-friend-count", uid] });
  };

  const removeFriend = async () => {
    if (!friendship) return;
    const { error } = await supabase.rpc("remove_friend" as any, { _friendship_id: friendship.id });
    if (error) return toast.error(error.message);
    toast.success("Removed");
    refetchFriendship();
    qc.invalidateQueries({ queryKey: ["public-friend-count", uid] });
  };


  if (isLoading) {
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
  if (!profile) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h1 className="font-display text-3xl font-bold mb-2">User not found</h1>
          <p className="text-muted-foreground">
            No one trades under @{username}.{" "}
            <Link to="/leaderboard" className="text-primary hover:underline">
              See the leaderboard
            </Link>
          </p>
        </div>
      </div>
    );
  }


  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-start gap-5 mb-8 flex-wrap">
          <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} userId={profile.id} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-3xl font-bold">@{profile.username}</h1>
              <TierBadge peakNetWorth={profile.peak_net_worth} size="md" />
              {me && me.id !== profile.id && (
                <>
                  {!friendship && (
                    <Button size="sm" onClick={sendRequest}>Add friend</Button>
                  )}
                  {friendship?.status === "pending" && friendship.requester_id === me.id && (
                    <Button size="sm" variant="secondary" disabled>Request sent</Button>
                  )}
                  {friendship?.status === "pending" && friendship.addressee_id === me.id && (
                    <Button size="sm" onClick={acceptRequest}>Accept request</Button>
                  )}
                  {friendship?.status === "accepted" && (
                    <Button size="sm" variant="secondary" onClick={removeFriend}>Friends ✓</Button>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Member since {format(new Date(profile.created_at), "MMMM yyyy")}
            </p>
            {profile.bio && <p className="mt-3 text-sm max-w-xl">{profile.bio}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <Stat label="Markets created" value={String(marketsCreated ?? 0)} />
          <Stat label="Friends" value={String(friendCount ?? 0)} />
        </div>

        <section>
          <h2 className="font-display text-xl font-bold mb-3">Trading history</h2>

          {!me ? (
            <EmptyNote>
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              to see this trader's history.
            </EmptyNote>
          ) : historyLoading ? (
            <EmptyNote>Loading…</EmptyNote>
          ) : !tradingHistory?.visible ? (
            <EmptyNote>
              <span className="inline-flex items-center gap-2">
                <Lock size={14} /> This user has made their trading history private.
              </span>
            </EmptyNote>
          ) : (
            <div className="space-y-6">
              {isOwnProfile && profile.trading_history_public === false && (
                <p className="text-xs text-muted-foreground">
                  Only you can see this — your history is set to private in{" "}
                  <Link to="/settings" className="text-primary hover:underline">
                    settings
                  </Link>
                  .
                </p>
              )}

              <div>
                <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Open positions
                </h3>
                {tradingHistory.positions.length === 0 ? (
                  <EmptyNote>No open positions.</EmptyNote>
                ) : (
                  <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {tradingHistory.positions.map((pos: any) => (
                      <div key={pos.market_id} className="px-4 py-3 flex items-center gap-4">
                        <Link
                          to="/markets/$id"
                          params={{ id: pos.market_id }}
                          className="flex-1 min-w-0 text-sm hover:text-primary truncate"
                        >
                          {pos.market_title}
                        </Link>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {Number(pos.yes_shares) > 0 && (
                            <span className="text-yes">{Number(pos.yes_shares).toFixed(0)} YES</span>
                          )}
                          {Number(pos.yes_shares) > 0 && Number(pos.no_shares) > 0 && " · "}
                          {Number(pos.no_shares) > 0 && (
                            <span className="text-no">{Number(pos.no_shares).toFixed(0)} NO</span>
                          )}
                        </span>
                        <span className="text-xs font-mono tabular-nums shrink-0 w-16 text-right">
                          {fmtCredits(pos.value ?? 0)}c
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Trade ledger
                </h3>
                <TradeLedger trades={(tradingHistory.trades ?? []) as LedgerTrade[]} />
              </div>

            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
      {children}
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
