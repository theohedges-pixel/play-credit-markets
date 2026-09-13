import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface NetWorthRow {
  credits: number;
  position_value: number;
  net_worth: number;
  peak_net_worth: number;
}

/**
 * Current account standing straight from the leaderboard view — the single
 * source of truth for net worth, so the header can never drift from the
 * leaderboard. One indexed single-row read, cached for a minute.
 */
export function useNetWorth() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["net-worth", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<NetWorthRow | null> => {
      const { data } = await (supabase as any)
        .from("leaderboard_net_worth")
        .select("credits, position_value, net_worth, peak_net_worth")
        .eq("id", user!.id)
        .maybeSingle();
      if (!data) return null;
      return {
        credits: Number(data.credits),
        position_value: Number(data.position_value),
        net_worth: Number(data.net_worth),
        peak_net_worth: Number(data.peak_net_worth),
      };
    },
  });
}
