import { Link } from "@tanstack/react-router";
import { fmtCredits, fmtPct, timeUntil, yesPrice } from "@/lib/format";

export interface MarketCardData {
  id: string;
  title: string;
  closes_at: string;
  yes_pool: number;
  no_pool: number;
  volume: number;
  status: string;
  resolution: string | null;
  category?: { name: string } | null;
}

export function MarketCard({ m }: { m: MarketCardData }) {
  const price = yesPrice(Number(m.yes_pool), Number(m.no_pool));
  const isResolved = m.status === "resolved";
  return (
    <Link
      to="/markets/$id"
      params={{ id: m.id }}
      className="group block rounded-lg border border-border bg-card hover:border-primary/40 transition p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <h3 className="font-display font-semibold text-base leading-snug line-clamp-2 group-hover:text-primary transition">
          {m.title}
        </h3>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-bold text-yes tabular-nums">
            {fmtPct(price)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">YES</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {m.category?.name && (
            <span className="px-2 py-0.5 rounded bg-secondary text-foreground/70">
              {m.category.name}
            </span>
          )}
          <span className="font-mono">{fmtCredits(m.volume)} vol</span>
        </div>
        <span className={isResolved ? "text-no" : ""}>
          {isResolved ? `Resolved ${m.resolution?.toUpperCase()}` : timeUntil(m.closes_at)}
        </span>
      </div>
    </Link>
  );
}
