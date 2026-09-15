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
  /** Pools for open markets — used to quote a realistic exit (slippage-aware). */
  yes_pool?: number | string | null;
  no_pool?: number | string | null;
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
const gainWord = (v: number) => (Math.round(v) > 0 ? "GAIN" : Math.round(v) < 0 ? "LOSS" : "EVEN");

type Line = { label: string; value: string; tone?: "muted" | "gain" };

/**
 * The plain-English breakdown of a single trade:
 *   what you put in, what a token is worth now, what you'd walk away with.
 */
export function tradeBreakdown(t: LedgerTrade): Line[] {
  const shares = Number(t.shares);
  const price = Number(t.price);
  const credits = Number(t.credits);
  const g = tradeGain(t);
  const tokens = `${shares.toFixed(2)} ${t.side.toUpperCase()} token${shares === 1 ? "" : "s"}`;

  if (t.action === "sell") {
    return [
      {
        label: "Sold",
        value: `${tokens} @ ${fmtPct(price)} = ${fmtCredits(credits)}c received`,
      },
      g.amount != null
        ? { label: "Realized", value: `${signed(g.amount)} ${gainWord(g.amount)}`, tone: "gain" }
        : { label: "Realized", value: "—", tone: "muted" },
    ];
  }

  const lines: Line[] = [
    {
      label: "Total bid value",
      value: `${fmtCredits(credits)}c @ ${fmtPct(price)} per token × ${tokens}`,
    },
  ];

  if (g.kind === "live") {
    const current = price + (g.amount ?? 0) / (shares || 1);
    lines.push({ label: "Current price", value: `${fmtPct(current)} per token` });
    lines.push({
      label: "If sold now",
      value: `${fmtCredits(shares * current)}c = ${signed(g.amount ?? 0)} ${gainWord(g.amount ?? 0)}`,
      tone: "gain",
    });
  } else if (g.kind === "final") {
    const settlement =
      t.market_resolution === "invalid" ? 0.5 : t.market_resolution === t.side ? 1 : 0;
    lines.push({
      label: "Settled at",
      value: `${fmtPct(settlement)} per token · ${g.detail}`,
    });
    lines.push({
      label: "Paid out",
      value: `${fmtCredits(shares * settlement)}c = ${signed(g.amount ?? 0)} ${gainWord(g.amount ?? 0)}`,
      tone: "gain",
    });
  } else {
    lines.push({ label: "Status", value: "Awaiting resolution", tone: "muted" });
  }

  return lines;
}

export function TradeRow({
  trade,
  showMarket = true,
  showUser = false,
  onSell,
}: {
  trade: LedgerTrade;
  showMarket?: boolean;
  showUser?: boolean;
  /** When provided, open buys on still-open markets get a "Sell now" button. */
  onSell?: (trade: LedgerTrade) => void;
}) {
  const g = tradeGain(trade);
  const sideClass = trade.side === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no";
  const lines = tradeBreakdown(trade);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2 flex-wrap">
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

        <div className="ml-auto shrink-0 flex items-center gap-2">
          {onSell && g.kind === "live" && (
            <button
              type="button"
              onClick={() => onSell(trade)}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              Sell now
            </button>
          )}
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {format(new Date(trade.created_at), "d MMM yyyy, HH:mm")}
          </span>
        </div>
      </div>

      <dl className="mt-2 space-y-0.5">
        {lines.map((l) => (
          <div key={l.label} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <dt className="w-32 shrink-0 text-muted-foreground">{l.label}</dt>
            <dd
              className={`font-mono tabular-nums ${
                l.tone === "gain"
                  ? gainClass(g.amount ?? 0)
                  : l.tone === "muted"
                    ? "text-muted-foreground"
                    : "text-foreground"
              }`}
            >
              {l.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TradeLedger({
  trades,
  showMarket = true,
  showUser = false,
  empty = "No trades yet.",
  onSell,
}: {
  trades: LedgerTrade[];
  showMarket?: boolean;
  showUser?: boolean;
  empty?: string;
  onSell?: (trade: LedgerTrade) => void;
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
        <TradeRow key={t.id} trade={t} showMarket={showMarket} showUser={showUser} onSell={onSell} />
      ))}
    </div>
  );
}
