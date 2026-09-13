import { Card } from "@/components/ui/card";
import { formatDistanceToNowStrict } from "date-fns";
import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { yesPrice } from "@/lib/format";

export interface MarketCardData {
  id: string;
  title: string;
  closes_at: string;
  yes_pool: number;
  no_pool: number;
  volume: number;
  created_via?: string | null;
  source?: string | null;
  category?: { name: string } | null;
}

/** Urgency styling for the closing countdown. */
function timeClass(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 24 * 60 * 60 * 1000) return "font-semibold text-no"; // < 24h: warm & bold
  if (ms <= 7 * 24 * 60 * 60 * 1000) return "text-foreground/80"; // < 7d: normal
  return "text-muted-foreground/70"; // later: muted
}

export function MarketCard({ m }: { m: MarketCardData }) {
  const p = yesPrice(m);
  const zeroVolume = !m.volume || m.volume <= 0;

  return (
    <Link to="/markets/$id" params={{ id: m.id }} className="group">
      <Card className="h-full p-5 hover:border-primary/50 transition-colors bg-card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {m.category?.name ?? "General"}
          </span>
          {m.created_via === "ai_generated" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-yes/50 text-yes shrink-0">
              AI-estimated odds
            </span>
          )}
        </div>
        <h3 className="font-semibold text-base leading-snug mb-5 line-clamp-2 group-hover:text-primary transition-colors">
          {m.title}
        </h3>
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-2">
            <div>
              <span className="text-2xl font-bold font-mono text-yes">
                {Math.round(p * 100)}¢
              </span>
              <span className="text-xs text-muted-foreground ml-1">YES</span>
            </div>
            {zeroVolume && (
              <span className="text-[11px] text-muted-foreground/70 italic">
                Not yet traded
              </span>
            )}
          </div>
          <span className={`text-xs ${zeroVolume ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
            {m.volume.toFixed(0)} vol
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-3">
          <div className="h-full bg-yes transition-all" style={{ width: `${p * 100}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50 truncate">
            {m.source === "polymarket" ? "via Polymarket" : m.source === "community" ? "community" : ""}
          </span>
          <span className={`flex items-center gap-1 shrink-0 ${timeClass(m.closes_at)}`}>
            <History size={11} />
            {formatDistanceToNowStrict(new Date(m.closes_at), { addSuffix: false })} left
          </span>
        </div>
      </Card>
    </Link>
  );
}
