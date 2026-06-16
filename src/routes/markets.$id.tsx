import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { fmtCredits, fmtPct, timeUntil, yesPrice } from "@/lib/format";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetail,
});

function MarketDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user, profile, refreshProfile } = useAuth();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("10");
  const [submitting, setSubmitting] = useState(false);

  const { data: market } = useQuery({
    queryKey: ["market", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("markets")
        .select("*, category:categories(name), creator:profiles!markets_creator_id_fkey(username)")
        .eq("id", id)
        .single();
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["price-history", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("price_history")
        .select("yes_price, recorded_at")
        .eq("market_id", id)
        .order("recorded_at")
        .limit(200);
      return (data ?? []).map((p) => ({
        t: new Date(p.recorded_at).getTime(),
        price: Number(p.yes_price) * 100,
      }));
    },
  });

  const { data: trades } = useQuery({
    queryKey: ["trades", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("trades")
        .select("id, side, action, shares, credits, price, created_at, user:profiles(username)")
        .eq("market_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: position } = useQuery({
    queryKey: ["position", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("positions")
        .select("*")
        .eq("market_id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!market) {
    return (
      <div>
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-pulse">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="h-3 w-24 bg-secondary rounded mb-3" />
              <div className="h-8 w-3/4 bg-secondary rounded mb-2" />
              <div className="h-8 w-1/2 bg-secondary rounded" />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="h-12 w-24 bg-secondary rounded mb-6" />
              <div className="h-48 bg-secondary/60 rounded" />
            </div>
            <div className="rounded-lg border border-border bg-card h-40" />
          </div>
          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card h-64" />
          </aside>
        </div>
      </div>
    );
  }

  const price = yesPrice(Number(market.yes_pool), Number(market.no_pool));
  const isResolved = market.status === "resolved";
  const isClosed = isResolved || new Date(market.closes_at) <= new Date();
  const canResolve = user && (user.id === market.creator_id);

  const placeTrade = async () => {
    if (!user) { toast.error("Sign in to trade"); return; }
    const credits = parseFloat(amount);
    if (!credits || credits <= 0) { toast.error("Enter an amount"); return; }
    if (profile && credits > profile.credits) { toast.error("Not enough credits"); return; }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("place_trade", {
      _market_id: id,
      _side: side,
      _credits: credits,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    const result = data as { shares: number; price: number };
    toast.success(`Bought ${result.shares.toFixed(2)} ${side.toUpperCase()} shares @ ${fmtPct(result.price)}`);
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["market", id] });
    qc.invalidateQueries({ queryKey: ["price-history", id] });
    qc.invalidateQueries({ queryKey: ["trades", id] });
    qc.invalidateQueries({ queryKey: ["position", id, user.id] });
  };

  const resolveMarket = async (resolution: "yes" | "no" | "invalid") => {
    if (!confirm(`Resolve this market as ${resolution.toUpperCase()}? This pays out winners and cannot be undone.`)) return;
    const { error } = await supabase.rpc("resolve_market", {
      _market_id: id,
      _resolution: resolution,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Market resolved");
    qc.invalidateQueries({ queryKey: ["market", id] });
    refreshProfile();
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              {market.category && <span className="px-2 py-0.5 rounded bg-secondary">{market.category.name}</span>}
              <span>by @{(market as any).creator?.username ?? "anon"}</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight">{market.title}</h1>
            {market.description && (
              <p className="text-muted-foreground mt-3 whitespace-pre-line">{market.description}</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Current YES price</div>
                <div className="font-display text-5xl font-bold text-yes tabular-nums mt-1">{fmtPct(price)}</div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>Volume <span className="font-mono text-foreground">{fmtCredits(market.volume)}</span></div>
                <div className="mt-1">{isResolved ? `Resolved ${market.resolution?.toUpperCase()}` : timeUntil(market.closes_at)}</div>
              </div>
            </div>
            <div className="h-48">
              {history && history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                      labelFormatter={(t) => format(new Date(t as number), "MMM d, HH:mm")}
                      formatter={(v) => [`${(v as number).toFixed(0)}¢`, "YES"]}
                    />
                    <Line type="monotone" dataKey="price" stroke="oklch(0.78 0.20 145)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No price history yet — be the first to trade.
                </div>
              )}
            </div>
          </div>

          {/* Recent trades */}
          <div className="rounded-lg border border-border bg-card">
            <div className="px-5 py-3 border-b border-border font-display font-semibold">Recent activity</div>
            <div className="divide-y divide-border">
              {trades && trades.length > 0 ? trades.map((t: any) => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${t.side === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
                      {t.side.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground">@{t.user?.username ?? "anon"}</span>
                  </div>
                  <div className="font-mono text-muted-foreground">
                    {Number(t.shares).toFixed(2)} sh · {fmtCredits(t.credits)}c · {fmtPct(Number(t.price))}
                  </div>
                </div>
              )) : (
                <div className="px-5 py-6 text-sm text-muted-foreground">No trades yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Trade panel — desktop sidebar, hidden on mobile */}
        <aside className="hidden lg:block space-y-4">
          {renderTradeBox()}
          {renderPositionBox()}
          {renderResolveBox()}
        </aside>
      </div>

      {/* Mobile sticky bottom bar with sheet trigger */}
      <div className="lg:hidden h-24" aria-hidden />
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 safe-bottom">
        {!isClosed ? (
          <Sheet>
            <div className="flex gap-2 items-center">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <SheetTrigger asChild>
                  <button
                    onClick={() => setSide("yes")}
                    className="py-3 rounded-md font-display font-semibold border bg-yes text-yes-foreground border-yes"
                  >
                    YES {fmtPct(price)}
                  </button>
                </SheetTrigger>
                <SheetTrigger asChild>
                  <button
                    onClick={() => setSide("no")}
                    className="py-3 rounded-md font-display font-semibold border bg-no text-no-foreground border-no"
                  >
                    NO {fmtPct(1 - price)}
                  </button>
                </SheetTrigger>
              </div>
            </div>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="font-display">Place a trade</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {renderTradeBox(true)}
                {renderPositionBox()}
                {renderResolveBox()}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-center">
            {isResolved
              ? <>Resolved <span className={market.resolution === "yes" ? "text-yes" : "text-no"}>{market.resolution?.toUpperCase()}</span></>
              : <span className="text-no">Market closed</span>}
          </div>
        )}
      </div>
    </div>
  );

  function renderTradeBox(insideSheet = false) {
    if (isClosed) {
      return (
        <div className={`rounded-lg border border-border bg-card p-5 text-sm ${insideSheet ? "" : "sticky top-20"}`}>
          {isResolved ? (
            <>
              <div className="font-display font-semibold mb-1">Market resolved</div>
              <div className="text-muted-foreground">Outcome: <span className={market.resolution === "yes" ? "text-yes" : "text-no"}>{market.resolution?.toUpperCase()}</span></div>
            </>
          ) : (
            <>
              <div className="font-display font-semibold mb-1 text-no">Market closed</div>
              <div className="text-muted-foreground">Trading has ended. Awaiting resolution by the creator.</div>
              <Button disabled className="w-full mt-4" size="lg">Trading closed</Button>
            </>
          )}
        </div>
      );
    }
    return (
      <div className={`rounded-lg border border-border bg-card p-5 ${insideSheet ? "" : "sticky top-20"}`}>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setSide("yes")}
            className={`py-3 rounded-md font-display font-semibold border transition ${side === "yes" ? "bg-yes text-yes-foreground border-yes" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            YES {fmtPct(price)}
          </button>
          <button
            onClick={() => setSide("no")}
            className={`py-3 rounded-md font-display font-semibold border transition ${side === "no" ? "bg-no text-no-foreground border-no" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            NO {fmtPct(1 - price)}
          </button>
        </div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (credits)</label>
        <Input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 font-mono"
        />
        <div className="flex gap-2 mt-2">
          {[10, 50, 100, 500].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))} className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground">
              {v}
            </button>
          ))}
        </div>
        {user ? (
          <Button onClick={placeTrade} disabled={submitting} className="w-full mt-4" size="lg">
            {submitting ? "Placing…" : `Buy ${side.toUpperCase()}`}
          </Button>
        ) : (
          <Link to="/login" className="block mt-4">
            <Button className="w-full" size="lg">Sign in to trade</Button>
          </Link>
        )}
        {profile && (
          <div className="text-xs text-muted-foreground text-center mt-3 font-mono">
            Balance: {fmtCredits(profile.credits)} credits
          </div>
        )}
      </div>
    );
  }

  function renderPositionBox() {
    if (!position || (Number(position.yes_shares) <= 0 && Number(position.no_shares) <= 0)) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm">
        <div className="font-display font-semibold mb-3">Your position</div>
        <div className="space-y-1 font-mono">
          <div className="flex justify-between"><span className="text-yes">YES shares</span><span>{Number(position.yes_shares).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-no">NO shares</span><span>{Number(position.no_shares).toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground border-t border-border pt-2 mt-2"><span>Spent</span><span>{fmtCredits(position.credits_spent)}c</span></div>
        </div>
      </div>
    );
  }

  function renderResolveBox() {
    if (!canResolve || isResolved) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-display font-semibold mb-2 text-sm">Resolve market</div>
        <p className="text-xs text-muted-foreground mb-3">As the creator, you can resolve and pay out winners.</p>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={() => resolveMarket("yes")} className="border-yes/50 text-yes hover:bg-yes/10">YES</Button>
          <Button size="sm" variant="outline" onClick={() => resolveMarket("no")} className="border-no/50 text-no hover:bg-no/10">NO</Button>
          <Button size="sm" variant="ghost" onClick={() => resolveMarket("invalid")}>Void</Button>
        </div>
      </div>
    );
  }
}
