import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { History, Layers } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { yesPrice } from "@/lib/format";
import type { MarketCardData } from "@/components/MarketCard";

export interface GroupedMarketData extends MarketCardData {
  polymarket_event_id?: string | null;
  polymarket_event_title?: string | null;
  group_item_title?: string | null;
  /** True number of open outcomes upstream; may exceed what we hold. */
  upstream_outcome_count?: number | null;
}

/** Outcomes shown before the "show all" expansion kicks in. */
const PREVIEW = 4;

/**
 * Shared collapsed height for every card in the list, grouped or not, so the
 * grid reads as an even set of tiles instead of alternating sizes. Sized to a
 * collapsed group card (header + 4 outcome rows + footer); single markets fill
 * the same box with their footer pinned to the bottom.
 */
export const CARD_MIN_HEIGHT = "min-h-[372px]";

/**
 * Per-event expansion state, kept outside React so a card the user opened (or
 * closed) stays that way through re-renders and refilters while they remain on
 * the page. Every card starts collapsed.
 */
const overrides = new Map<string, boolean>();

/**
 * Label for one outcome inside a group. Polymarket's groupItemTitle is the
 * clean per-outcome label ("0 - 2", "Dallas Cowboys"); when it's missing we
 * fall back to the market title with the shared event title stripped off,
 * which keeps the row readable without inventing a grouping.
 */
export function outcomeLabel(m: GroupedMarketData, eventTitle: string): string {
  const g = m.group_item_title?.trim();
  if (g) return g;
  const t = m.title.trim();
  const ev = eventTitle.trim();
  if (ev && t.toLowerCase().startsWith(ev.toLowerCase())) {
    const rest = t.slice(ev.length).replace(/^[\s:\-–—]+/, "").trim();
    if (rest) return rest;
  }
  return t;
}

function timeClass(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 24 * 60 * 60 * 1000) return "font-semibold text-no";
  if (ms <= 7 * 24 * 60 * 60 * 1000) return "text-foreground/80";
  return "text-muted-foreground/70";
}

/**
 * One card for a real-world event that has several independent outcome markets.
 * Purely presentational: every outcome still links to its own market page and
 * keeps its own pools, trades and resolution.
 */
export function GroupedMarketCard({
  markets,
  eventTitle,
}: {
  markets: GroupedMarketData[];
  eventTitle: string;
}) {
  const eventKey = markets[0]?.polymarket_event_id ?? eventTitle;
  const volume = markets.reduce((s, m) => s + Number(m.volume ?? 0), 0);
  // A truncated field must say so: unlabelled, the prices look like they should
  // sum to 100% when they can't.
  const upstreamTotal = markets.reduce(
    (n, m) => Math.max(n, Number(m.upstream_outcome_count ?? 0)),
    0,
  );
  const [expanded, setExpandedState] = useState<boolean>(() => overrides.get(eventKey) ?? false);
  const setExpanded = (v: boolean) => {
    overrides.set(eventKey, v);
    setExpandedState(v);
  };

  const rows = markets
    .map((m) => ({ m, p: yesPrice(m.yes_pool, m.no_pool) }))
    .sort((a, b) => b.p - a.p);
  const shown = expanded ? rows : rows.slice(0, PREVIEW);

  const closesAt = markets
    .map((m) => m.closes_at)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]!;

  return (
    <Card className={`h-full ${CARD_MIN_HEIGHT} p-5 bg-card flex flex-col`}>
      <div className="sticky top-0 z-10 -mx-5 -mt-5 px-5 pt-5 pb-3 bg-card rounded-t-[inherit]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {markets[0]?.category?.name ?? "General"}
          </span>
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground shrink-0">
            <Layers size={10} />
            {markets.length} outcomes
          </span>
        </div>

        <h3 className="font-semibold text-base leading-snug min-h-[3rem] line-clamp-2">{eventTitle}</h3>
        {/* Reserved whether or not it is used, so labelled and complete
            groups keep the same header height. */}
        <p className="mt-1 h-4 text-[11px] text-muted-foreground">
          {upstreamTotal > markets.length
            ? `${markets.length} of ${upstreamTotal} outcomes, by trading volume`
            : ""}
        </p>
      </div>


      <div className="space-y-1.5 flex-1">
        {shown.map(({ m, p }) => (
          <Link
            key={m.id}
            to="/markets/$id"
            params={{ id: m.id }}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-secondary/60 transition-colors group"
          >
            <span className="flex-1 text-sm truncate group-hover:text-primary transition-colors">
              {outcomeLabel(m, eventTitle)}
            </span>
            <span className="w-16 shrink-0">
              <span className="block h-1.5 rounded-full bg-secondary overflow-hidden">
                <span className="block h-full bg-yes" style={{ width: `${p * 100}%` }} />
              </span>
            </span>
            <span className="font-mono text-sm text-yes w-10 text-right shrink-0">
              {Math.round(p * 100)}¢
            </span>
          </Link>
        ))}
      </div>

      {rows.length > PREVIEW && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 self-start"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length} outcomes`}
        </button>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-4 pt-3 border-t border-border/60">
        <span className={volume > 0 ? "" : "text-muted-foreground/60"}>{volume.toFixed(0)} vol</span>
        <span className={`flex items-center gap-1 shrink-0 ${timeClass(closesAt)}`}>
          <History size={11} />
          {formatDistanceToNowStrict(new Date(closesAt), { addSuffix: false })} left
        </span>
      </div>
    </Card>
  );
}
