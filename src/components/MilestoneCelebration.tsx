import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Gem } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { tierLabel, tierStyle } from "@/lib/milestones";
import { fmtCredits } from "@/lib/format";

const SEEN_KEY = "predikt.milestones.celebrated";

const loadSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/**
 * Celebrates wealth milestones the moment the database awards one, wherever the
 * user happens to be. Polls for fresh milestone notifications (the notifications
 * table isn't in the realtime publication) and fires each one exactly once.
 */
export function MilestoneCelebration() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const seen = useRef<Set<string>>(new Set());

  const { data: pending } = useQuery({
    queryKey: ["milestone-notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications" as any)
        .select("id, payload, created_at")
        .eq("kind", "milestone_reached")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data as any[] | null) ?? [];
    },
  });

  useEffect(() => {
    if (!user || !pending?.length) return;
    if (seen.current.size === 0) loadSeen().forEach((id) => seen.current.add(id));

    const fresh = pending.filter((n) => !seen.current.has(n.id));
    if (!fresh.length) return;

    // Only the highest tier gets the fanfare if several landed at once.
    const top = fresh.reduce((a, b) =>
      Number(a.payload?.tier ?? 0) >= Number(b.payload?.tier ?? 0) ? a : b,
    );
    celebrate(Number(top.payload?.tier ?? 0), Number(top.payload?.net_worth ?? 0));

    fresh.forEach((n) => {
      seen.current.add(n.id);
      void supabase.rpc("mark_notification_read" as any, { _id: n.id });
    });
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current].slice(-50)));
    } catch {
      /* private mode — the read flag still prevents repeats */
    }
    qc.invalidateQueries({ queryKey: ["net-worth", user.id] });
    qc.invalidateQueries({ queryKey: ["milestones", user.id] });
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  }, [pending, user, qc]);

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
