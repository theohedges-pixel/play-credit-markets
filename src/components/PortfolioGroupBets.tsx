import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fmtCredits } from "@/lib/format";
import { Users } from "lucide-react";

type Bet = {
  id: string;
  title: string;
  closes_at: string;
  status: string;
  resolution: "yes" | "no" | "invalid" | null;
  stake: number | null;
};

type Part = {
  group_bet_id: string;
  user_id: string;
  side: "yes" | "no";
  credits_wagered: number | string;
  payout: number | string | null;
};

const signed = (v: number) => `${Math.round(v) > 0 ? "+" : ""}${fmtCredits(Math.round(v))}c`;
const gainClass = (v: number) =>
  Math.round(v) > 0 ? "text-yes" : Math.round(v) < 0 ? "text-no" : "text-muted-foreground";
const gainWord = (v: number) => (Math.round(v) > 0 ? "GAIN" : Math.round(v) < 0 ? "LOSS" : "EVEN");

export function useGroupBetSummary(userId?: string) {
  return useQuery({
    queryKey: ["portfolio-group-bets", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: mine } = await (supabase as any)
        .from("group_bet_participants")
        .select("group_bet_id, user_id, side, credits_wagered, payout")
        .eq("user_id", userId!);
      const rows = (mine ?? []) as Part[];
      if (!rows.length) return { bets: [], atStake: 0, settled: 0 };

      const ids = Array.from(new Set(rows.map((r) => r.group_bet_id)));
      const [{ data: betRows }, { data: allParts }] = await Promise.all([
        (supabase as any)
          .from("group_bets")
          .select("id, title, closes_at, status, resolution, stake")
          .in("id", ids),
        (supabase as any)
          .from("group_bet_participants")
          .select("group_bet_id, user_id, side, credits_wagered, payout")
          .in("group_bet_id", ids),
      ]);

      const bets = ((betRows ?? []) as Bet[]).map((b) => {
        const parts = ((allParts ?? []) as Part[]).filter((p) => p.group_bet_id === b.id);
        const mineRow = rows.find((r) => r.group_bet_id === b.id)!;
        const wagered = Number(mineRow.credits_wagered);
        const pot = parts.reduce((s, p) => s + Number(p.credits_wagered), 0);
        const sideTotal = parts
          .filter((p) => p.side === mineRow.side)
          .reduce((s, p) => s + Number(p.credits_wagered), 0);
        const payout = mineRow.payout == null ? null : Number(mineRow.payout);
        const ifWin = sideTotal > 0 ? (wagered / sideTotal) * pot : wagered;
        return {
          bet: b,
          side: mineRow.side,
          wagered,
          pot,
          sideTotal,
          people: parts.length,
          payout,
          ifWin,
          settled: b.status === "resolved",
        };
      });

      bets.sort((a, b) => {
        if (a.settled !== b.settled) return a.settled ? 1 : -1;
        return +new Date(a.bet.closes_at) - +new Date(b.bet.closes_at);
      });

      const atStake = bets.filter((b) => !b.settled).reduce((s, b) => s + b.wagered, 0);
      const settled = bets
        .filter((b) => b.settled)
        .reduce((s, b) => s + ((b.payout ?? 0) - b.wagered), 0);

      return { bets, atStake, settled };
    },
  });
}

export function PortfolioGroupBets({ userId }: { userId?: string }) {
  const { data, isLoading } = useGroupBetSummary(userId);
  const bets = data?.bets ?? [];

  return (
    <section className="mb-8" aria-labelledby="gb-heading">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="gb-heading" className="font-display text-xl font-semibold flex items-center gap-2">
          <Users size={16} className="text-primary" /> Group bets
        </h2>
        <Link to="/group-bets" className="text-sm text-primary hover:underline shrink-0">
          All group bets
        </Link>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Credits staked with friends. These sit outside your market positions until the bet settles.
      </p>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 animate-pulse" />
      ) : !bets.length ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          You haven't joined a group bet yet —{" "}
          <Link to="/group-bets" className="text-primary hover:underline">
            start one with friends
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">At stake</div>
              <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {fmtCredits(data!.atStake)}c
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">In bets not yet settled</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">Settled P&amp;L</div>
              <div
                className={`mt-1 font-display text-2xl font-semibold tabular-nums ${gainClass(data!.settled)}`}
              >
                {signed(data!.settled)}c
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">From resolved bets</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {bets.map((b) => {
              const gain = b.settled ? (b.payout ?? 0) - b.wagered : b.ifWin - b.wagered;
              const sideClass = b.side === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no";
              return (
                <div key={b.bet.id} className="px-4 py-3">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${sideClass}`}
                    >
                      {b.side.toUpperCase()}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 border ${
                        b.settled
                          ? "border-border text-muted-foreground"
                          : "border-primary/40 text-primary"
                      }`}
                    >
                      {b.settled ? "Closed" : "Open"}
                    </span>
                    <Link
                      to="/group-bets/$id"
                      params={{ id: b.bet.id }}
                      className="flex-1 min-w-0 text-sm hover:text-primary truncate"
                    >
                      {b.bet.title}
                    </Link>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {format(new Date(b.bet.closes_at), "d MMM yyyy, HH:mm")}
                    </span>
                  </div>

                  <dl className="mt-2 space-y-0.5">
                    <Row
                      label="Your stake"
                      value={`${fmtCredits(b.wagered)}c on ${b.side.toUpperCase()}`}
                    />
                    <Row
                      label="Total pot"
                      value={`${fmtCredits(b.pot)}c across ${b.people} ${b.people === 1 ? "person" : "people"}`}
                    />
                    {b.settled ? (
                      <>
                        <Row
                          label="Resolved"
                          value={String(b.bet.resolution ?? "—").toUpperCase()}
                        />
                        <Row
                          label="Paid out"
                          value={`${fmtCredits(b.payout ?? 0)}c = ${signed(gain)} ${gainWord(gain)}`}
                          className={gainClass(gain)}
                        />
                      </>
                    ) : (
                      <Row
                        label="If your side wins"
                        value={`${fmtCredits(b.ifWin)}c = ${signed(gain)} ${gainWord(gain)}`}
                        className={gainClass(gain)}
                      />
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  className = "text-foreground",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`font-mono tabular-nums ${className}`}>{value}</dd>
    </div>
  );
}
