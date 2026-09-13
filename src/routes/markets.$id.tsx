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
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis, ReferenceDot } from "recharts";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { HowTradingWorksDialog } from "@/components/HowTradingWorksDialog";

// Renders the "AI estimate" annotation offset into the chart so it never clips
// at the left edge (the seed point is always the leftmost x).
function AiEstimateLabel(props: any) {
  const { viewBox } = props;
  if (!viewBox) return null;
  return (
    <text x={viewBox.x + 10} y={viewBox.y - 10} fill="var(--primary)" fontSize={10}>
      AI estimate
    </text>
  );
}
import { useMarketDetailRealtime } from "@/lib/realtime";

type RangeKey = "today" | "7d" | "30d" | "max";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "max", label: "Max" },
];



export const Route = createFileRoute("/markets/$id")({
  component: MarketDetail,
});

function MarketDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user, profile, refreshProfile } = useAuth();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [range, setRange] = useState<RangeKey>("max");


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
        // Imported markets carry a month+ of backfilled pre-import history.
        // The old ascending limit of 200 silently cut the series off, so the
        // chart only ever showed a slice. Fetch the full series and thin it
        // client-side instead of truncating it here.
        .limit(5000);
      return (data ?? []).map((p) => ({
        t: new Date(p.recorded_at).getTime(),
        price: Number(p.yes_price) * 100,
      }));
    },
  });

  // Activity from every trader who keeps their history public (plus the
  // viewer's own trades). The opt-out is enforced inside get_market_activity.
  const { data: trades } = useQuery({
    queryKey: ["market-activity", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_market_activity", {
        _market_id: id,
        _limit: 40,
      });
      if (error) throw error;
      return (data ?? []) as any[];
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

  // Live price/volume/status + chart updates over websocket.
  useMarketDetailRealtime(id);

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

  const aiGenerated = market.created_via === "ai_generated";
  const hasTrades = (trades?.length ?? 0) > 0 || Number(market.volume) > 0;
  const yesPool = Number(market.yes_pool);
  const noPool = Number(market.no_pool);
  const price = yesPrice(yesPool, noPool);
  const isResolved = market.status === "resolved";
  const isClosed = isResolved || market.status !== "open" || new Date(market.closes_at) <= new Date();
  const canResolve = user && (user.id === market.creator_id);

  // --- Chart series -------------------------------------------------------
  // price_history only records points when something happens, so a sparse
  // market would otherwise render as a lone dot (or an empty window). We
  // carry the last known price forward into the window start and always
  // extend the line to "now" with the current live price.
  const points = history ?? [];
  const chartNow = Date.now();
  const windowStart =
    range === "today"
      ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
      : range === "7d"
        ? chartNow - 7 * 86_400_000
        : range === "30d"
          ? chartNow - 30 * 86_400_000
          : (points[0]?.t ?? chartNow);

  const inWindow = points.filter((p) => p.t >= windowStart);
  const carried = [...points].reverse().find((p) => p.t < windowStart);

  const chartData: { t: number; price: number }[] = [];
  if (points.length > 0) {
    if (carried && (inWindow.length === 0 || inWindow[0]!.t > windowStart)) {
      chartData.push({ t: windowStart, price: carried.price });
    }
    chartData.push(...inWindow);
    const last = chartData[chartData.length - 1];
    if (!last || last.t < chartNow) chartData.push({ t: chartNow, price: price * 100 });
  }

  // Thin dense series (backfilled imports run to thousands of points) down to
  // a chart-friendly count, always keeping the first and last point.
  const MAX_PLOT_POINTS = 400;
  if (chartData.length > MAX_PLOT_POINTS) {
    const step = Math.ceil(chartData.length / MAX_PLOT_POINTS);
    const thinned = chartData.filter((_, i) => i % step === 0);
    const last = chartData[chartData.length - 1]!;
    if (thinned[thinned.length - 1]!.t !== last.t) thinned.push(last);
    chartData.length = 0;
    chartData.push(...thinned);
  }

  // Only annotate the AI seed when the real first point falls inside the window.
  const seedVisible = points.length > 0 && points[0]!.t >= windowStart;


  const sharesNum = Number(amount);
  const validAmount = Number.isFinite(sharesNum) && sharesNum > 0;
  const balance = profile ? Number(profile.credits) : 0;

  const holdsPosition =
    !!position && (Number(position.yes_shares) > 0 || Number(position.no_shares) > 0);
  const heldYes = position ? Number(position.yes_shares) : 0;
  const heldNo = position ? Number(position.no_shares) : 0;
  const heldForSide = side === "yes" ? heldYes : heldNo;
  const canSellAny = heldYes > 0 || heldNo > 0;

  // Own pool / other pool for the selected side (mirrors the RPC math).
  const ownPool = side === "yes" ? yesPool : noPool;
  const otherPool = side === "yes" ? noPool : yesPool;

  const quoteBuy = (s: number) => {
    const b = ownPool - s + otherPool;
    return Math.round(((-b + Math.sqrt(b * b + 4 * s * otherPool)) / 2) * 100) / 100;
  };
  const quoteSell = (s: number) => {
    const b = ownPool + s + otherPool;
    const disc = b * b - 4 * s * otherPool;
    if (disc < 0) return 0;
    return Math.round(((b - Math.sqrt(disc)) / 2) * 100) / 100;
  };

  const cost = validAmount && mode === "buy" ? quoteBuy(sharesNum) : 0;
  const proceeds = validAmount && mode === "sell" ? quoteSell(sharesNum) : 0;
  const quoted = mode === "buy" ? cost : proceeds;
  const avgPrice = validAmount && quoted > 0 ? quoted / sharesNum : (side === "yes" ? price : 1 - price);
  const insufficient = mode === "buy" && validAmount && !!profile && cost > balance;
  const notEnoughShares = mode === "sell" && validAmount && sharesNum > heldForSide;

  // Price after the trade, using the same constant-product update as the RPCs.
  const resultingPrice = (() => {
    if (!validAmount) return price;
    const c = mode === "buy" ? quoteBuy(sharesNum) : quoteSell(sharesNum);
    if (c <= 0) return price;
    if (mode === "buy") {
      const newOwn = ownPool + c - sharesNum;
      const newOther = otherPool + c;
      if (side === "yes") {
        return yesPrice(newOwn, newOther);
      }
      return yesPrice(newOther, newOwn);
    }
    const newOwn = ownPool + sharesNum - c;
    const newOther = otherPool - c;
    if (side === "yes") {
      return yesPrice(newOwn, newOther);
    }
    return yesPrice(newOther, newOwn);
  })();
  const priceImpactPoints = Math.abs((resultingPrice - price) * 100);
  const largeImpact = priceImpactPoints > 5;

  // Largest whole share count affordable with the current balance.
  const maxShares = (() => {
    if (!profile || balance <= 0) return 0;
    let lo = 0, hi = Math.ceil(balance / 0.01);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (mid < ownPool + otherPool && quoteBuy(mid) <= balance) lo = mid; else hi = mid - 1;
    }
    return lo;
  })();

  const refreshAll = () => {
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["market", id] });
    qc.invalidateQueries({ queryKey: ["price-history", id] });
    qc.invalidateQueries({ queryKey: ["market-activity", id] });
    qc.invalidateQueries({ queryKey: ["position", id, user?.id] });
    qc.invalidateQueries({ queryKey: ["net-worth", user?.id] });
  };

  const placeTrade = async () => {
    if (!user) { toast.error("Sign in to trade"); return; }
    if (!validAmount) { toast.error("Enter a number of shares"); return; }
    if (mode === "buy" && insufficient) { toast.error("Not enough credits"); return; }
    if (mode === "sell" && notEnoughShares) { toast.error("You don't hold that many shares"); return; }
    setSubmitting(true);
    const res = await (supabase as any).rpc(mode === "buy" ? "buy_shares" : "sell_shares", {
      p_market_id: id,
      p_side: side,
      p_shares: sharesNum,
    });
    setSubmitting(false);
    if (res.error) { toast.error(res.error.message); return; }
    const result = res.data as { success?: boolean; error?: string; shares?: number; cost?: number; proceeds?: number };
    if (result?.error) { toast.error(result.error); return; }
    if (mode === "buy") {
      toast.success(`Bought ${Number(result.shares)} ${side.toUpperCase()} shares for ${fmtCredits(result.cost ?? 0)} credits.`);
    } else {
      toast.success(`Sold ${Number(result.shares)} ${side.toUpperCase()} shares for ${fmtCredits(result.proceeds ?? 0)} credits.`);
    }
    setAmount("");
    refreshAll();
  };



  const flagResolution = async () => {
    const { error } = await (supabase.rpc as any)("flag_market_resolution", { _market_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Flagged — this market will be reviewed manually before any payout");
    qc.invalidateQueries({ queryKey: ["market", id] });
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

            {(market as any).proposed_resolution && !isResolved && (
              <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
                <div className="text-sm font-medium">
                  Proposed outcome: {String((market as any).proposed_resolution).toUpperCase()}
                </div>
                {(market as any).resolution_reason && (
                  <p className="text-sm text-muted-foreground mt-1">{(market as any).resolution_reason}</p>
                )}
                {(market as any).auto_resolution_deadline && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Payout runs in {timeUntil((market as any).auto_resolution_deadline)} unless a position
                    holder flags it.
                  </p>
                )}
                {holdsPosition && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={flagResolution}>
                    This looks wrong — flag it
                  </Button>
                )}
              </div>
            )}

            {(market as any).needs_manual_resolution && !isResolved && (
              <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                Awaiting manual review — the outcome couldn't be confirmed automatically, so an admin will
                settle this market.
              </div>
            )}

            {isResolved && (market as any).resolution_reason && (
              <p className="mt-3 text-sm text-muted-foreground">
                Resolved {String(market.resolution).toUpperCase()} — {(market as any).resolution_reason}
              </p>
            )}
            {market.description && (
              <p className="text-muted-foreground mt-3 whitespace-pre-line">{market.description}</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Current YES price</div>
                <div className="font-display text-5xl font-bold text-yes tabular-nums mt-1">{fmtPct(price)}</div>
                {aiGenerated && !hasTrades && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary">
                    ✦ Starting price set by AI estimate — not yet shaped by trading
                  </div>
                )}
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>Volume <span className="font-mono text-foreground">{fmtCredits(market.volume)}</span></div>
                <div className="mt-1">{isResolved ? `Resolved ${market!.resolution?.toUpperCase()}` : timeUntil(market.closes_at)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              {RANGES.map((r) => (
                <Button
                  key={r.key}
                  size="sm"
                  variant={r.key === range ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <div className="h-48">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    {/* Real elapsed time on X, padded auto-range on Y so small
                        moves are visible instead of squashed against 0-100. */}
                    <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
                    <YAxis
                      domain={[
                        (min: number) => Math.max(0, Math.floor(min - 5)),
                        (max: number) => Math.min(100, Math.ceil(max + 5)),
                      ]}
                      hide
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                      labelFormatter={(t) => format(new Date(t as number), "MMM d, HH:mm")}
                      formatter={(v) => [`${(v as number).toFixed(0)}¢`, "YES"]}
                    />
                    <Line type="monotone" dataKey="price" stroke="oklch(0.78 0.20 145)" strokeWidth={2} dot={false} />
                    {aiGenerated && seedVisible && (
                      <ReferenceDot
                        x={history![0].t}
                        y={history![0].price}
                        r={5}
                        fill="var(--primary)"
                        stroke="var(--background)"
                        strokeWidth={2}
                        label={<AiEstimateLabel />}
                      />
                    )}
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
            <div className="px-5 py-3 border-b border-border font-display font-semibold">Activity</div>
            {trades && trades.length > 0 ? (
              <div className="divide-y divide-border">
                {trades.map((t: any) => (
                  <TradeRow key={t.id} trade={t as LedgerTrade} showMarket={false} showUser />
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-sm text-muted-foreground">
                {user ? "No public activity on this market yet." : "Sign in to see activity here."}
              </div>
            )}
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
              ? <>Resolved <span className={market!.resolution === "yes" ? "text-yes" : "text-no"}>{market!.resolution?.toUpperCase()}</span></>
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
              <div className="text-muted-foreground">Outcome: <span className={market!.resolution === "yes" ? "text-yes" : "text-no"}>{market!.resolution?.toUpperCase()}</span></div>
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
    const actionLabel = !user
      ? "Sign in to trade"
      : !validAmount
        ? "Enter an amount"
        : mode === "buy"
          ? (insufficient ? "Insufficient credits" : `Buy ${side.toUpperCase()}`)
          : (notEnoughShares ? "Insufficient shares" : `Sell ${side.toUpperCase()}`);

    return (
      <div className={`rounded-lg border border-border bg-card p-5 ${insideSheet ? "" : "sticky top-20"}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Trade</span>
          <HowTradingWorksDialog />
        </div>
        <div className="grid grid-cols-2 gap-1 mb-4 p-1 rounded-md bg-secondary/60">
          <button
            onClick={() => { setMode("buy"); setAmount(""); }}
            className={`py-2 rounded text-sm font-display font-semibold transition ${mode === "buy" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Buy
          </button>
          <button
            onClick={() => { setMode("sell"); setAmount(""); if (heldForSide <= 0) setSide(heldYes > 0 ? "yes" : "no"); }}
            disabled={!canSellAny}
            className={`py-2 rounded text-sm font-display font-semibold transition disabled:opacity-40 ${mode === "sell" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setSide("yes")}
            disabled={mode === "sell" && heldYes <= 0}
            className={`py-4 rounded-md font-display text-base font-semibold border transition disabled:opacity-40 ${side === "yes" ? "bg-yes text-yes-foreground border-yes" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            YES {fmtPct(price)}
          </button>
          <button
            onClick={() => setSide("no")}
            disabled={mode === "sell" && heldNo <= 0}
            className={`py-4 rounded-md font-display text-base font-semibold border transition disabled:opacity-40 ${side === "no" ? "bg-no text-no-foreground border-no" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            NO {fmtPct(1 - price)}
          </button>
        </div>

        <label htmlFor="trade-amount" className="text-xs uppercase tracking-wider text-muted-foreground">Shares</label>
        <Input
          id="trade-amount"
          type="number"
          min="1"
          step="1"
          max={(mode === "buy" ? maxShares : heldForSide) || undefined}
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 font-mono"
        />
        <div className="flex gap-2 mt-2">
          {[1, 5, 10, 50].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))} className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground">
              {v}
            </button>
          ))}
          {mode === "buy" ? (
            <button
              onClick={() => setAmount(String(maxShares))}
              disabled={!profile}
              className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Max
            </button>
          ) : (
            <button
              onClick={() => setAmount(String(heldForSide))}
              disabled={heldForSide <= 0}
              className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Sell all
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-2 font-mono">
          {mode === "buy"
            ? <>Balance: {profile ? fmtCredits(profile.credits) : "—"} credits</>
            : <>Held: {heldForSide.toFixed(2)} {side.toUpperCase()} shares</>}
        </div>

        <div className="mt-4 rounded-md border border-border bg-secondary/40 p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {mode === "buy" ? "Total cost" : "You receive"}
          </div>
          <div className={`font-display text-3xl font-bold tabular-nums mt-1 ${side === "yes" ? "text-yes" : "text-no"}`}>
            {quoted.toFixed(2)} credits
          </div>
          <div className="mt-2 space-y-1 text-xs font-mono text-muted-foreground">
            <div className="flex justify-between"><span>Avg price per share</span><span>{(avgPrice * 100).toFixed(1)}¢</span></div>
            <div className="flex justify-between"><span>Shares</span><span>{validAmount ? sharesNum : 0}</span></div>
            <div className="flex justify-between"><span>Price impact</span><span>{fmtPct(price)} → {fmtPct(resultingPrice)}</span></div>
          </div>
        </div>


        {largeImpact && (
          <div className="mt-3 rounded-md border border-no/30 bg-no/10 px-3 py-2 text-xs text-no">
            Large trade — this will move the market price significantly
          </div>
        )}

        {user ? (
          <Button
            onClick={placeTrade}
            disabled={submitting || !validAmount || insufficient || notEnoughShares}
            className="w-full mt-4"
            size="lg"
          >
            {submitting ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Placing…</>) : actionLabel}
          </Button>
        ) : (
          <Link to="/login" className="block mt-4">
            <Button className="w-full" size="lg">Sign in to trade</Button>
          </Link>
        )}
      </div>
    );

  }

  function renderPositionBox() {
    const yesShares = position ? Number(position.yes_shares) : 0;
    const noShares = position ? Number(position.no_shares) : 0;
    const spent = position ? Number(position.credits_spent) : 0;
    const hasPosition = yesShares > 0 || noShares > 0;
    const value = yesShares * price + noShares * (1 - price);
    const won = isResolved
      ? market!.resolution === "yes" ? yesShares > 0 : market!.resolution === "no" ? noShares > 0 : null
      : null;

    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm">
        <div className="font-display font-semibold mb-3">Your position</div>
        {hasPosition ? (
          <div className="space-y-1 font-mono">
            <div className="flex justify-between"><span className="text-yes">YES shares</span><span>{yesShares.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-no">NO shares</span><span>{noShares.toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground border-t border-border pt-2 mt-2"><span>Spent</span><span>{fmtCredits(spent)}c</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Current value</span><span>~{fmtCredits(value)}c</span></div>
            {isResolved && (
              <div className="pt-2 mt-2 border-t border-border font-sans">
                Resolved <span className={market!.resolution === "yes" ? "text-yes" : "text-no"}>{market!.resolution?.toUpperCase()}</span>
                {won === true && <span className="text-yes"> — you won</span>}
                {won === false && <span className="text-no"> — you lost</span>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">You have no position in this market yet.</p>
        )}
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
