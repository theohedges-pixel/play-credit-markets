import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { fmtCredits, fmtPct, yesPrice } from "@/lib/format";
import { toast } from "sonner";
import { Coins, Gift } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Predikt" }] }),
  component: Portfolio,
});

function Portfolio() {
  const { user, profile, refreshProfile } = useAuth();

  const { data: positions, refetch, isLoading } = useQuery({
    queryKey: ["positions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("positions")
        .select("*, market:markets(id, title, status, resolution, yes_pool, no_pool)")
        .eq("user_id", user!.id);
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

  // compute portfolio value
  let posValue = 0;
  positions?.forEach((p: any) => {
    if (!p.market) return;
    const price = yesPrice(Number(p.market.yes_pool), Number(p.market.no_pool));
    posValue += Number(p.yes_shares) * price + Number(p.no_shares) * (1 - price);
  });

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="font-display text-4xl font-bold mb-1">Portfolio</h1>
        <p className="text-muted-foreground text-sm mb-8">@{profile?.username}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Coins size={12} /> Cash</div>
            <div className="font-display text-3xl font-bold mt-1 tabular-nums">{fmtCredits(profile?.credits ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Position value</div>
            <div className="font-display text-3xl font-bold mt-1 text-yes tabular-nums">{fmtCredits(posValue)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Net worth</div>
            <div className="font-display text-3xl font-bold mt-1 tabular-nums">{fmtCredits((profile?.credits ?? 0) + posValue)}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 mb-8 flex items-center justify-between">
          <div>
            <div className="font-display font-semibold flex items-center gap-2"><Gift size={16} className="text-primary" /> Daily reward</div>
            <p className="text-sm text-muted-foreground mt-1">
              Claim 100 free credits every day. Resets at 00:00 UTC.
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button onClick={claimDaily} disabled={claimed}>
                    {claimed ? "Claimed today" : "Claim +100"}
                  </Button>
                </span>
              </TooltipTrigger>
              {claimed && <TooltipContent>Come back tomorrow</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>

        <h2 className="font-display text-xl font-semibold mb-4">Positions</h2>
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {positions && positions.length > 0 ? positions.map((p: any) => {
            if (!p.market) return null;
            const price = yesPrice(Number(p.market.yes_pool), Number(p.market.no_pool));
            const value = Number(p.yes_shares) * price + Number(p.no_shares) * (1 - price);
            const pnl = value - Number(p.credits_spent);
            return (
              <Link key={p.id} to="/markets/$id" params={{ id: p.market.id }} className="block px-5 py-4 hover:bg-secondary/30 transition">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.market.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {Number(p.yes_shares) > 0 && <span className="text-yes mr-3">{Number(p.yes_shares).toFixed(2)} YES</span>}
                      {Number(p.no_shares) > 0 && <span className="text-no">{Number(p.no_shares).toFixed(2)} NO</span>}
                      {p.market.status === "resolved" && <span className="ml-3 text-muted-foreground">· resolved {p.market.resolution?.toUpperCase()}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold">{fmtCredits(value)}c</div>
                    <div className={`text-xs font-mono ${pnl >= 0 ? "text-yes" : "text-no"}`}>
                      {pnl >= 0 ? "+" : ""}{fmtCredits(pnl)}c
                    </div>
                  </div>
                </div>
              </Link>
            );
          }) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No positions yet. <Link to="/markets" className="text-primary hover:underline">Browse markets</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
