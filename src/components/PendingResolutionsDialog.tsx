import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface PendingBet {
  id: string;
  title: string;
  description: string | null;
  closes_at: string;
  voting_started_at: string | null;
  votes_cast: number;
  eligible: number;
}

const SKIP_KEY = "predikt.skipped-bet-votes";

const readSkipped = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(SKIP_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/**
 * Prompts a signed-in member for the outcome of any closed group bet they
 * haven't voted on yet. One bet at a time; skipping hides it for the session.
 */
export function PendingResolutionsDialog() {
  const { user, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [side, setSide] = useState<"yes" | "no" | "invalid">("yes");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSkipped(readSkipped());
  }, []);

  const { data: pending } = useQuery({
    queryKey: ["pending-bet-votes", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_pending_group_bet_votes" as any);
      if (error) return [] as PendingBet[];
      return (data ?? []) as PendingBet[];
    },
  });

  const queue = useMemo(
    () => (pending ?? []).filter((b) => !skipped.includes(b.id)),
    [pending, skipped],
  );
  const bet = queue[0];

  useEffect(() => {
    setSide("yes");
    setReason("");
  }, [bet?.id]);

  const skip = (id: string) => {
    const next = [...readSkipped(), id];
    try {
      window.sessionStorage.setItem(SKIP_KEY, JSON.stringify(next));
    } catch {
      /* session storage unavailable — skip for this render only */
    }
    setSkipped(next);
  };

  const submit = async () => {
    if (!bet) return;
    if (!reason.trim()) return toast.error("Add a short reason for your vote");
    setSubmitting(true);
    const { data, error } = await supabase.rpc("propose_group_bet_resolution" as any, {
      _group_bet_id: bet.id,
      _resolution: side,
      _reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(
      r?.resolved
        ? `Settled ${String(r.resolution).toUpperCase()} — the group agreed`
        : `Vote recorded (${r?.votes} of ${r?.eligible})`,
    );
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["pending-bet-votes", user?.id] });
    qc.invalidateQueries({ queryKey: ["gb-detail", bet.id] });
    qc.invalidateQueries({ queryKey: ["gb-votes", bet.id] });
  };

  if (!bet) return null;

  const deadline = bet.voting_started_at
    ? new Date(new Date(bet.voting_started_at).getTime() + 48 * 3600 * 1000)
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) skip(bet.id); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">What was the outcome?</DialogTitle>
          <DialogDescription>
            This group bet has closed and is waiting on your call.
            {queue.length > 1 && ` ${queue.length} bets need your vote.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="font-medium">{bet.title}</p>
            {bet.description && (
              <p className="text-xs text-muted-foreground mt-1">{bet.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Closed {format(new Date(bet.closes_at), "MMM d, yyyy HH:mm")} ·{" "}
              {bet.votes_cast} of {bet.eligible} votes in
            </p>
          </div>

          <div className="flex gap-2">
            {(["yes", "no", "invalid"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={side === s ? "default" : "secondary"}
                onClick={() => setSide(s)}
              >
                {s === "invalid" ? "Invalid (refund)" : s.toUpperCase()}
              </Button>
            ))}
          </div>

          <Textarea
            rows={2}
            placeholder="Why? e.g. Final score was 112-104, confirmed on the official box score"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <p className="text-xs text-muted-foreground">
            It settles straight away if everyone votes the same way. Otherwise the majority of
            those who voted decides after 48 hours
            {deadline ? ` (by ${format(deadline, "MMM d, HH:mm")})` : ""} — and if nobody votes,
            everyone gets their credits back.
          </p>

          <div className="flex items-center justify-between gap-3">
            <Link
              to="/group-bets/$id"
              params={{ id: bet.id }}
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => skip(bet.id)}
            >
              Open the bet
            </Link>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => skip(bet.id)}>
                Not sure yet
              </Button>
              <Button size="sm" onClick={submit} disabled={submitting}>
                Submit vote
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
