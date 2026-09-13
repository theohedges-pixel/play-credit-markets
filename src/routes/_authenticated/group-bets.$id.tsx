import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const { user, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [origin, setOrigin] = useState("");
  const [voteSide, setVoteSide] = useState<"yes" | "no" | "invalid">("yes");
  const [voteReason, setVoteReason] = useState("");
  const search = useSearch({ strict: false }) as { new?: number };
  const justCreated = search.new === 1;

  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: bet, isLoading } = useQuery({
    queryKey: ["gb-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_bets" as any)
        .select("*, creator:public_profiles!group_bets_creator_id_fkey(id, username, avatar_url)")
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
          "id, user_id, side, credits_wagered, payout, user:public_profiles!group_bet_participants_user_id_fkey(id, username, avatar_url)",
        )
        .eq("group_bet_id", id);
      return (data ?? []) as any[];
    },
  });

  const { data: votes } = useQuery({
    queryKey: ["gb-votes", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_bet_resolution_votes" as any)
        .select(
          "id, voter_id, proposed_resolution, reason, voter:public_profiles!group_bet_resolution_votes_voter_id_fkey(id, username, avatar_url)",
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

  // Anyone taking part (creator included) can share their own chain link.
  const canShare = (isCreator || !!myPart) && bet.status === "open" && !closed && !!profile?.username;
  const shareUrl = profile?.username ? `${origin}/join/${profile.username}?bet=${bet.id}` : "";

  const share = async () => {
    const text = `Join me on Predikt — free prediction markets, no real money. Bet with me on: ${bet.title}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Predikt group bet", text, url: shareUrl });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy the link");
    }
  };

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

  const refreshAll = () => {
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["gb-detail", id] });
    qc.invalidateQueries({ queryKey: ["gb-parts", id] });
    qc.invalidateQueries({ queryKey: ["gb-votes", id] });
  };

  const castVote = async () => {
    if (!voteReason.trim()) return toast.error("Add a short reason for your vote");
    setSubmitting(true);
    const { data, error } = await supabase.rpc("propose_group_bet_resolution" as any, {
      _group_bet_id: id,
      _resolution: voteSide,
      _reason: voteReason.trim(),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(
      r?.resolved
        ? `Settled ${String(r.resolution).toUpperCase()} — the group agreed`
        : `Vote recorded (${r?.votes} of ${r?.eligible})`,
    );
    setVoteReason("");
    refreshAll();
  };

  const flagAuto = async () => {
    setSubmitting(true);
    const { error } = await supabase.rpc("flag_auto_resolution" as any, { _group_bet_id: id });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Flagged — the group will vote on the outcome instead");
    refreshAll();
  };

  const canVote = (isCreator || !!myPart) && closed &&
    (bet.status === "open" || bet.status === "voting");
  const eligibleCount = new Set([
    bet.creator_id,
    ...(participants ?? []).map((p) => p.user_id),
  ]).size;
  const tally = (votes ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.proposed_resolution] = (acc[v.proposed_resolution] ?? 0) + 1;
    return acc;
  }, {});
  const myVote = (votes ?? []).find((v) => v.voter_id === user?.id);
  const pendingAuto = bet.status === "pending_auto_resolution";
  const canFlag = pendingAuto && (isCreator || !!myPart);

  const fallbackAt = bet.voting_started_at
    ? new Date(new Date(bet.voting_started_at).getTime() + 24 * 3600 * 1000)
    : null;
  const msLeft = fallbackAt ? fallbackAt.getTime() - Date.now() : 0;
  const timeLeft =
    msLeft <= 0
      ? "any moment now"
      : msLeft >= 3600_000
        ? `${Math.floor(msLeft / 3600_000)}h ${Math.floor((msLeft % 3600_000) / 60_000)}m`
        : `${Math.max(1, Math.floor(msLeft / 60_000))}m`;
  const methodNote =
    bet.resolution_method === "majority_fallback"
      ? "Settled by majority fallback, not unanimous agreement"
      : bet.resolution_method === "no_consensus_refund"
        ? "No consensus reached — everyone was refunded"
        : bet.auto_resolved
          ? "Settled by automatic check"
          : "Settled by unanimous agreement";

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

        {canShare && (
          <div
            className={`rounded-lg border p-5 ${
              justCreated
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display font-semibold">
                  {justCreated ? "Bet created! Invite people to join" : "Share this bet"}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {justCreated
                    ? "Anyone with your link can join — friends or not — even if they're not on Predikt yet."
                    : "Anyone with your link can join — even if they're not on Predikt yet."}
                </p>
              </div>
              <Button size="sm" onClick={share}>
                <Share2 size={14} /> {justCreated ? "Invite" : "Share"}
              </Button>
            </div>
            <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="mt-3 text-xs" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pot" value={`${fmtCredits(totals.total)}c`} />
          <Stat label="YES" value={`${fmtCredits(totals.yes)}c`} tone="yes" />
          <Stat label="NO" value={`${fmtCredits(totals.no)}c`} tone="no" />
        </div>

        {!myPart && !isCreator && bet.status === "open" && !closed && (
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

        {bet.status === "resolved" && bet.resolution_reason && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display font-semibold">
              Resolved {String(bet.resolution).toUpperCase()}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">{bet.resolution_reason}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3">
              {methodNote}
            </p>
          </div>
        )}

        {pendingAuto && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-5">
            <h2 className="font-display font-semibold">
              We think this resolved {String(bet.proposed_resolution).toUpperCase()}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">{bet.resolution_reason}</p>
            {bet.auto_resolution_deadline && (
              <p className="text-xs text-muted-foreground mt-2">
                Credits move {format(new Date(bet.auto_resolution_deadline), "MMM d, yyyy HH:mm")}{" "}
                unless someone flags this.
              </p>
            )}
            {canFlag && (
              <Button size="sm" variant="secondary" className="mt-3" onClick={flagAuto} disabled={submitting}>
                This looks wrong — flag it
              </Button>
            )}
          </div>
        )}

        {bet.status === "voting" && fallbackAt && (
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-sm">
              Unanimous agreement needed to settle immediately — falls back to majority vote in{" "}
              <span className="font-mono">{timeLeft}</span>.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(votes ?? []).length} of {eligibleCount} votes in.
            </p>
          </div>
        )}

        {canVote && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display font-semibold mb-1">What was the outcome?</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Everyone in this bet gets one vote. It settles straight away only if everyone votes
              the same way — otherwise majority rule kicks in after 24 hours.
            </p>
            <div className="flex gap-2 mb-3">
              {(["yes", "no", "invalid"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={voteSide === s ? "default" : "secondary"}
                  onClick={() => setVoteSide(s)}
                >
                  {s === "invalid" ? "Invalid (refund)" : s.toUpperCase()}
                </Button>
              ))}
            </div>
            <Textarea
              rows={2}
              placeholder="Why? e.g. Final score was 112-104, confirmed on the official box score"
              value={voteReason}
              onChange={(e) => setVoteReason(e.target.value)}
            />
            <Button className="mt-3" onClick={castVote} disabled={submitting}>
              {myVote ? "Change my vote" : "Submit vote"}
            </Button>
          </div>
        )}

        {(votes ?? []).length > 0 && bet.status !== "resolved" && (
          <div>
            <h2 className="font-display font-semibold mb-3">Votes</h2>
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              <div className="px-5 py-3 text-xs text-muted-foreground">
                {(["yes", "no", "invalid"] as const)
                  .filter((s) => tally[s])
                  .map((s) => `${tally[s]} of ${eligibleCount} for ${s.toUpperCase()}`)
                  .join(" · ")}
              </div>
              {(votes ?? []).map((v) => (
                <div key={v.id} className="px-5 py-3 flex items-start gap-3">
                  <UserAvatar
                    username={v.voter?.username}
                    avatarUrl={v.voter?.avatar_url}
                    userId={v.voter?.id}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="text-sm">
                      @{v.voter?.username}{" "}
                      <span
                        className={`font-mono text-xs uppercase ${
                          v.proposed_resolution === "yes"
                            ? "text-yes"
                            : v.proposed_resolution === "no"
                              ? "text-no"
                              : "text-muted-foreground"
                        }`}
                      >
                        {v.proposed_resolution}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.reason}</p>
                  </div>
                </div>
              ))}
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
