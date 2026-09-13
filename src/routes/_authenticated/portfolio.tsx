import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtCredits, yesPrice } from "@/lib/format";
import { toast } from "sonner";
import { Coins, Gift, TrendingUp, WalletCards } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Predikt" },
      { name: "description", content: "Review your Predikt net worth, open positions, and trading performance." },
      { property: "og:title", content: "Portfolio — Predikt" },
      { property: "og:description", content: "Review your Predikt net worth, open positions, and trading performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Portfolio,
});

function Portfolio() {
  const { user, profile, refreshProfile } = useAuth();
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);

  useEffect(() => { setBio(profile?.bio ?? ""); }, [profile?.bio]);

  const saveBio = async () => {
    if (!user) return;
    setSavingBio(true);
    const { error } = await supabase
      .from("profiles")
      .update({ bio: bio.trim() || null })
      .eq("id", user.id);
    setSavingBio(false);
    if (error) return toast.error(error.message);
    toast.success("Bio updated");
    refreshProfile();
  };


  const { data: positions, refetch, isLoading } = useQuery({
    queryKey: ["positions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("positions")
        .select("*, market:markets(id, title, status, resolution, yes_pool, no_pool)")
        .eq("user_id", user.id);
      return data ?? [];
    },
  });

  const claimDaily = async () => {
    const { error } = await supabase.rpc("claim_daily_credits");
    if (error) { toast.error(error.message); return; }
    toast.success("+100 credits claimed!");
    refreshProfile();
  };

  const today = new Date().toISOString().slice(0, 10);
  const claimed = profile?.last_daily_claim === today;

  // Value a position the same way the leaderboard's net worth does: only
  // markets still trading carry position value. A resolved market has already
  // paid its credits into the cash balance, so counting its stale
  // pre-resolution price here would double-count those credits.
  const settlementPayout = (p: any) => {
    const res = p.market?.resolution;
    if (res === "yes") return Number(p.yes_shares);
    if (res === "no") return Number(p.no_shares);
    return Number(p.credits_spent); // invalid — stake returned
  };

  let posValue = 0;
  let unrealizedPnl = 0;
  let realizedPnl = 0;
  positions?.forEach((p: any) => {
    realizedPnl += Number(p.realized_pnl ?? 0);
    if (!p.market) return;
    if (p.market.status === "resolved") {
      // Fully realized: payout is already in cash, so it only affects P&L.
      realizedPnl += settlementPayout(p) - Number(p.credits_spent);
      return;
    }
    if (p.market.status !== "open") return; // closed, awaiting resolution
    const price = yesPrice(Number(p.market.yes_pool), Number(p.market.no_pool));
    const value = Number(p.yes_shares) * price + Number(p.no_shares) * (1 - price);
    posValue += value;
    unrealizedPnl += value - Number(p.credits_spent);
  });
  const totalPnl = unrealizedPnl + realizedPnl;
  const displayedValue = (v: number) => Math.round(v);
  const valueClass = (v: number) => displayedValue(v) > 0 ? "text-yes" : displayedValue(v) < 0 ? "text-no" : "text-muted-foreground";
  const signed = (v: number) => `${displayedValue(v) > 0 ? "+" : ""}${fmtCredits(displayedValue(v))}`;
  const positionRows = (positions ?? [])
    .filter((position: any) => position.market)
    .map((position: any) => {
      const resolved = position.market.status === "resolved";
      const price = yesPrice(Number(position.market.yes_pool), Number(position.market.no_pool));
      const value = resolved
        ? settlementPayout(position)
        : Number(position.yes_shares) * price + Number(position.no_shares) * (1 - price);
      const pnl = value - Number(position.credits_spent);
      return {
        position,
        value,
        resolved,
        pnl: resolved ? 0 : pnl,
        realized: Number(position.realized_pnl ?? 0) + (resolved ? pnl : 0),
      };
    })
    .sort((a, b) => b.value - a.value || a.position.market.title.localeCompare(b.position.market.title));

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-4 mb-1">
          <h1 className="font-display text-4xl font-bold">Portfolio</h1>
          <Link
            to="/achievements"
            className="text-sm text-primary hover:underline shrink-0"
          >
            Achievements
          </Link>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          <Link
            to="/users/$username"
            params={{ username: profile?.username ?? "" }}
            className="hover:text-foreground"
          >
            @{profile?.username}
          </Link>
        </p>

        <section className="mb-8 overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="worth-heading">
          <div className="border-b border-border p-6">
            <div id="worth-heading" className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><TrendingUp size={14} /> Net worth</div>
            <div className={`mt-2 font-display text-4xl font-bold tabular-nums ${valueClass((profile?.credits ?? 0) + posValue)}`}>
              {fmtCredits((profile?.credits ?? 0) + posValue)}c
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-5">
              <div className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground"><Coins size={12} /> Cash</div>
              <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${valueClass(profile?.credits ?? 0)}`}>{fmtCredits(profile?.credits ?? 0)}c</div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground"><WalletCards size={12} /> Position value</div>
              <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${valueClass(posValue)}`}>{fmtCredits(posValue)}c</div>
            </div>
          </div>
        </section>

        <section className="mb-8 overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="pnl-heading">
          <div className="border-b border-border p-6">
            <div id="pnl-heading" className="text-xs uppercase text-muted-foreground">Total P&amp;L</div>
            <div className={`mt-2 font-display text-3xl font-bold tabular-nums ${valueClass(totalPnl)}`}>{signed(totalPnl)}c</div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-5">
              <div className="text-xs uppercase text-muted-foreground">Unrealized</div>
              <div className={`mt-1 font-display text-xl font-semibold tabular-nums ${valueClass(unrealizedPnl)}`}>{signed(unrealizedPnl)}c</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Open positions</div>
            </div>
            <div className="p-5">
              <div className="text-xs uppercase text-muted-foreground">Realized</div>
              <div className={`mt-1 font-display text-xl font-semibold tabular-nums ${valueClass(realizedPnl)}`}>{signed(realizedPnl)}c</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Completed sales</div>
            </div>
          </div>
        </section>

        <h2 className="font-display text-xl font-semibold mb-1">Trade ledger</h2>
        <p className="text-xs text-muted-foreground mb-4">Every trade, newest first.</p>
        {ledgerLoading ? (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-4 animate-pulse">
                <div className="h-4 w-2/3 bg-secondary rounded mb-2" />
                <div className="h-3 w-24 bg-secondary rounded" />
              </div>
            ))}
          </div>
        ) : (
          <TradeLedger
            trades={ledgerTrades}
            empty="No trades yet — browse markets to place your first."
          />
        )}


        <div className="my-8 rounded-lg border border-border bg-card p-5 flex items-center justify-between gap-5">
          <div>
            <div className="font-display font-semibold flex items-center gap-2"><Gift size={16} className="text-primary" /> Daily reward</div>
            <p className="text-sm text-muted-foreground mt-1">Claim 100 free credits every day. Resets at 00:00 UTC.</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><span tabIndex={0}><Button onClick={claimDaily} disabled={claimed}>{claimed ? "Claimed today" : "Claim +100"}</Button></span></TooltipTrigger>
              {claimed && <TooltipContent>Come back tomorrow</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>

        <section className="border-t border-border pt-8">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Public bio</h2>
              <p className="text-xs text-muted-foreground">Shown on your public profile</p>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{bio.length}/280</span>
          </div>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} placeholder="A short bio shown on your public profile…" rows={2} className="mb-3" />
          <Button size="sm" variant="secondary" onClick={saveBio} disabled={savingBio || bio === (profile?.bio ?? "")}>
            {savingBio ? "Saving…" : "Save bio"}
          </Button>
        </section>
      </div>
    </div>
  );
}
