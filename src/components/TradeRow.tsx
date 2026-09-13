import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fmtCredits, fmtPct } from "@/lib/format";

/**
 * One row per individual trade. The gain shown is decided ENTIRELY by
 * `action` + `market_status`:
 *
 *   buy  + open      → live/theoretical gain vs the market's current price
 *   buy  + !open     → final gain vs the settlement value (1 / 0 / 0.5)
 *   sell + anything  → the realized gain stored on the trade itself
 *
 * A resolved market therefore cannot render a live price comparison: the
 * `current_yes_price` branch is unreachable unless status === 'open', and the
 * server sends NULL for current_yes_price on resolved markets anyway.
 */
export type LedgerTrade = {
  id: string;
  market_id: string;
  market_title?: string | null;
  market_status: "open" | "closed" | "resolved";
  market_resolution: "yes" | "no" | "invalid" | null;
  current_yes_price: number | string | null;
  side: "yes" | "no";
  action: "buy" | "sell";
  shares: number | string;
  price: number | string;
  credits: number | string;
  realized_gain: number | string | null;
  created_at: string;
  username?: string | null;
};

type GainKind = "live" | "final" | "realized" | "pending";

export function tradeGain(t: LedgerTrade): {
  kind: GainKind;
  closed: boolean;
  amount: number | null;
  label: string;
  detail: string;
} {
  const shares = Number(t.shares);
  const price = Number(t.price);

  if (t.action === "sell") {
    const amount = t.realized_gain == null ? null : Number(t.realized_gain);
    return {
      kind: "realized",
      closed: true,
      amount,
      label: "Realized gain",
      detail: `Sold at ${fmtPct(price)}`,
    };
  }

  if (t.market_status === "resolved") {
    const settlement =
      t.market_resolution === "invalid" ? 0.5 : t.market_resolution === t.side ? 1 : 0;
    return {
      kind: "final",
      closed: true,
      amount: shares * (settlement - price),
      label: "Final gain",
      detail: `Resolved ${String(t.market_resolution ?? "").toUpperCase() || "—"}`,
    };
  }

  if (t.market_status === "open" && t.current_yes_price != null) {
    const yesPrice = Number(t.current_yes_price);
    const current = t.side === "yes" ? yesPrice : 1 - yesPrice;
    return {
      kind: "live",
      closed: false,
      amount: shares * (current - price),
      label: "If sold now",
      detail: `Now ${fmtPct(current)}`,
    };
  }

  return { kind: "pending", closed: false, amount: null, label: "", detail: "Awaiting resolution" };
}

const signed = (v: number) => `${Math.round(v) > 0 ? "+" : ""}${fmtCredits(Math.round(v))}c`;
const gainClass = (v: number) =>
  Math.round(v) > 0 ? "text-yes" : Math.round(v) < 0 ? "text-no" : "text-muted-foreground";

export function TradeRow({
  trade,
  showMarket = true,
  showUser = false,
}: {
  trade: LedgerTrade;
  showMarket?: boolean;
  showUser?: boolean;
}) {
  const g = tradeGain(trade);
  const sideClass = trade.side === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${sideClass}`}>
          {trade.action.toUpperCase()} {trade.side.toUpperCase()}
        </span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 border ${
            g.closed
              ? "border-border text-muted-foreground"
              : "border-primary/40 text-primary"
          }`}
        >
          {g.closed ? "Closed" : "Open"}
        </span>

        {showUser && trade.username && (
          <Link
            to="/users/$username"
            params={{ username: trade.username }}
            className="text-xs text-muted-foreground hover:text-primary shrink-0"
          >
            @{trade.username}
          </Link>
        )}

        {showMarket && trade.market_title && (
          <Link
            to="/markets/$id"
            params={{ id: trade.market_id }}
            className="flex-1 min-w-0 text-sm hover:text-primary truncate"
          >
            {trade.market_title}
          </Link>
        )}

        <div className="ml-auto text-right shrink-0">
          <div className="text-xs font-mono tabular-nums text-muted-foreground">
            {Number(trade.shares).toFixed(2)} sh @ {fmtPct(Number(trade.price))} ·{" "}
            {fmtCredits(trade.credits)}c
          </div>
          {g.amount != null ? (
            <div className={`text-xs font-mono tabular-nums ${gainClass(g.amount)}`}>
              {g.label} {signed(g.amount)}
              <span className="text-muted-foreground"> · {g.detail}</span>
            </div>
          ) : (
            <div className="text-xs font-mono text-muted-foreground">{g.detail}</div>
          )}
        </div>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {format(new Date(trade.created_at), "d MMM yyyy, HH:mm")}
      </div>
    </div>
  );
}

export function TradeLedger({
  trades,
  showMarket = true,
  showUser = false,
  empty = "No trades yet.",
}: {
  trades: LedgerTrade[];
  showMarket?: boolean;
  showUser?: boolean;
  empty?: string;
}) {
  if (!trades.length) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {trades.map((t) => (
        <TradeRow key={t.id} trade={t} showMarket={showMarket} showUser={showUser} />
      ))}
    </div>
  );
}
