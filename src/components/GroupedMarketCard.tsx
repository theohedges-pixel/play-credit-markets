import { useEffect, useState } from "react";
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
}

/** Outcomes shown before the "show all" expansion kicks in. */
const PREVIEW = 4;

/**
 * Groups whose combined volume clears this render fully expanded. Chosen from
 * the live distribution of group volumes: it selects the top third of groups
 * (the notable elections / championships) and leaves the long tail collapsed.
 */
export const AUTO_EXPAND_VOLUME = 10_000_000;

/**
 * Fallback rule: a wide field is itself a signal of significance — nobody
 * builds a 12-way market for an obscure event. Catches the big championship
 * and price-ladder events whose volume sits below the threshold.
 */
export const AUTO_EXPAND_OUTCOMES = 12;

/** Auto-expansion is desktop-only; a 20-outcome card is unscannable on a phone. */
const AUTO_EXPAND_MIN_WIDTH = 640;

/**
 * Per-event expansion overrides, kept outside React so a user's choice to
 * collapse an auto-expanded card survives re-renders/refilters while they
 * stay on the page.
 */
const overrides = new Map<string, boolean>();

function useWideViewport(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${AUTO_EXPAND_MIN_WIDTH}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

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
  const wide = useWideViewport();
  // Either signal of significance is enough: heavy trading, or a field wide
  // enough that nobody would have built it for an obscure event.
  const autoExpanded =
    wide && (volume >= AUTO_EXPAND_VOLUME || markets.length >= AUTO_EXPAND_OUTCOMES);

  const [override, setOverride] = useState<boolean | undefined>(() => overrides.get(eventKey));
  const expanded = override ?? autoExpanded;
  const setExpanded = (v: boolean) => {
    overrides.set(eventKey, v);
    setOverride(v);
  };

  const rows = markets
    .map((m) => ({ m, p: yesPrice(m.yes_pool, m.no_pool) }))
    .sort((a, b) => b.p - a.p);
  const shown = expanded ? rows : rows.slice(0, PREVIEW);

  const closesAt = markets
    .map((m) => m.closes_at)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]!;

  return (
    <Card className="h-full p-5 bg-card flex flex-col">
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

        <h3 className="font-semibold text-base leading-snug line-clamp-2">{eventTitle}</h3>
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
