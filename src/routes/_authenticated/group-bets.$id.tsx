import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { fmtCredits } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/group-bets/$id")({
  head: ({ params }) => ({ meta: [{ title: `Group bet — Predikt` }] }),
  component: GroupBetDetail,
});

function GroupBetDetail() {
  const { id } = Route.useParams();
  const { user, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: bet, isLoading } = useQuery({
    queryKey: ["gb-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_bets" as any)
        .select("*, creator:profiles!group_bets_creator_id_fkey(id, username, avatar_url)")
        .eq("id", id)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: participants } = useQuery({
    queryKey: ["gb-parts", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_bet_participants" as any)
        .select(
          "id, user_id, side, credits_wagered, payout, user:profiles!group_bet_participants_user_id_fkey(id, username, avatar_url)",
        )
        .eq("group_bet_id", id);
      return (data ?? []) as any[];
    },
  });

  if (isLoading) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-10 animate-pulse space-y-4">
          <div className="h-8 w-2/3 bg-secondary rounded" />
          <div className="h-32 bg-secondary rounded" />
        </div>
      </div>
    );
  }
  if (!bet) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Bet not found</h1>
          <Link to="/group-bets" className="text-primary hover:underline">
            Back to group bets
          </Link>
        </div>
      </div>
    );
  }

  const isCreator = bet.creator_id === user?.id;
  const closed = new Date(bet.closes_at) <= new Date();
  const myPart = (participants ?? []).find((p) => p.user_id === user?.id);

  const totals = (participants ?? []).reduce(
    (acc, p) => {
      acc.total += Number(p.credits_wagered);
      if (p.side === "yes") acc.yes += Number(p.credits_wagered);
      else acc.no += Number(p.credits_wagered);
      return acc;
    },
    { total: 0, yes: 0, no: 0 },
  );

  const join = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("Enter a positive amount");
    setSubmitting(true);
    const { error } = await supabase.rpc("join_group_bet" as any, {
      _group_bet_id: id,
      _side: side,
      _credits: n,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Joined");
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["gb-parts", id] });
  };

  const resolve = async (resolution: "yes" | "no" | "invalid") => {
    setSubmitting(true);
    const { error } = await supabase.rpc("resolve_group_bet" as any, {
      _group_bet_id: id,
      _resolution: resolution,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Resolved");
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["gb-detail", id] });
    qc.invalidateQueries({ queryKey: ["gb-parts", id] });
  };

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">{bet.title}</h1>
          {bet.description && (
            <p className="text-muted-foreground mt-2">{bet.description}</p>
          )}
          <div className="text-xs text-muted-foreground mt-3">
            Created by{" "}
            <Link
              to="/users/$username"
              params={{ username: bet.creator?.username ?? "" }}
              className="hover:text-foreground"
            >
              @{bet.creator?.username}
            </Link>{" "}
            · Closes {format(new Date(bet.closes_at), "MMM d, yyyy HH:mm")}
            {bet.status === "resolved" && bet.resolution && (
              <span className="ml-2 text-foreground">· Resolved {String(bet.resolution).toUpperCase()}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pot" value={`${fmtCredits(totals.total)}c`} />
          <Stat label="YES" value={`${fmtCredits(totals.yes)}c`} tone="yes" />
          <Stat label="NO" value={`${fmtCredits(totals.no)}c`} tone="no" />
        </div>

        {!myPart && bet.status === "open" && !closed && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display font-semibold mb-3">Join this bet</h2>
            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                variant={side === "yes" ? "default" : "secondary"}
                onClick={() => setSide("yes")}
              >
                YES
              </Button>
              <Button
                size="sm"
                variant={side === "no" ? "default" : "secondary"}
                onClick={() => setSide("no")}
              >
                NO
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Credits to wager"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button onClick={join} disabled={submitting}>
                {submitting ? "Joining…" : "Join"}
              </Button>
            </div>
          </div>
        )}

        {isCreator && closed && bet.status !== "resolved" && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display font-semibold mb-3">Resolve</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => resolve("yes")} disabled={submitting}>
                YES wins
              </Button>
              <Button size="sm" onClick={() => resolve("no")} disabled={submitting}>
                NO wins
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resolve("invalid")}
                disabled={submitting}
              >
                Invalid (refund)
              </Button>
            </div>
          </div>
        )}

        <div>
          <h2 className="font-display font-semibold mb-3">Participants</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {(participants ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-center text-muted-foreground">
                Nobody has joined yet.
              </p>
            ) : (
              (participants ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <Link
                    to="/users/$username"
                    params={{ username: p.user?.username ?? "" }}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <UserAvatar
                      username={p.user?.username}
                      avatarUrl={p.user?.avatar_url}
                      userId={p.user?.id}
                      size="sm"
                    />
                    <span className="truncate">@{p.user?.username}</span>
                  </Link>
                  <div className="text-right">
                    <div
                      className={`text-xs font-mono uppercase ${
                        p.side === "yes" ? "text-yes" : "text-no"
                      }`}
                    >
                      {p.side}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {fmtCredits(Number(p.credits_wagered))}c
                      {p.payout != null && (
                        <span className="ml-2 text-foreground">
                          → {fmtCredits(Number(p.payout))}c
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "yes" | "no";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-display text-2xl font-bold tabular-nums mt-1 ${
          tone === "yes" ? "text-yes" : tone === "no" ? "text-no" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
