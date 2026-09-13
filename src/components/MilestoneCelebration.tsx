import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Gem } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { tierLabel, tierStyle } from "@/lib/milestones";
import { fmtCredits } from "@/lib/format";

/**
 * Listens for milestone notifications written by the database and celebrates
 * them once, wherever the user happens to be in the app.
 */
export function MilestoneCelebration() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`milestone-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; kind: string; payload: any };
          if (row.kind !== "milestone_reached") return;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);
          celebrate(Number(row.payload?.tier ?? 0), Number(row.payload?.net_worth ?? 0));
          qc.invalidateQueries({ queryKey: ["net-worth", user.id] });
          qc.invalidateQueries({ queryKey: ["milestones", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  return null;
}

function celebrate(tier: number, netWorth: number) {
  const style = tierStyle(tier);
  const colors = ["#63f06f", "#bdf7c2", "#8b8b8b", "#ffffff"];
  const burst = (ratio: number, opts: confetti.Options) =>
    confetti({
      ...opts,
      origin: { y: 0.35 },
      particleCount: Math.floor(140 * ratio),
      colors,
      scalar: 0.9,
      ticks: 220,
      disableForReducedMotion: true,
    });
  burst(0.25, { spread: 26, startVelocity: 55 });
  burst(0.2, { spread: 60 });
  burst(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });

  toast.custom(
    () => (
      <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-card px-4 py-3 shadow-lg">
        <span className={`rounded-full border p-2 ${style.className}`}>
          <Gem size={18} />
        </span>
        <div>
          <div className="font-display text-sm font-bold">
            {tierLabel(tier)} milestone reached
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Peak net worth {fmtCredits(netWorth)} credits — badge earned for life
          </div>
        </div>
      </div>
    ),
    { duration: 8000 },
  );
}
