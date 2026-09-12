import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live updates for a single market detail page.
 * - markets UPDATE (this market) -> patch the ["market", id] cache in place
 * - price_history INSERT (this market) -> append the point to ["price-history", id]
 */
export function useMarketDetailRealtime(id: string) {
  const qc: QueryClient = useQueryClient();

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`market:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "markets", filter: `id=eq.${id}` },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          qc.setQueryData(["market", id], (prev: Record<string, unknown> | undefined) =>
            prev
              ? {
                  ...prev,
                  yes_pool: next.yes_pool,
                  no_pool: next.no_pool,
                  volume: next.volume,
                  status: next.status,
                  resolution: next.resolution,
                  resolved_at: next.resolved_at,
                }
              : prev,
          );
          // recent activity list is cheap and unpredictable in shape — refetch it
          qc.invalidateQueries({ queryKey: ["trades", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_history", filter: `market_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { yes_price: number | string; recorded_at: string };
          const point = {
            t: new Date(row.recorded_at).getTime(),
            price: Number(row.yes_price) * 100,
          };
          qc.setQueryData(
            ["price-history", id],
            (prev: Array<{ t: number; price: number }> | undefined) => {
              if (!prev) return prev;
              if (prev.some((p) => p.t === point.t)) return prev;
              return [...prev, point].slice(-200);
            },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);
}

/**
 * Live updates for market lists (markets index, homepage trending).
 * Any market UPDATE invalidates the given query key prefix, debounced so a
 * burst of trades doesn't cause a refetch storm.
 */
export function useMarketListRealtime(queryKey: unknown[], channelName: string) {
  const qc = useQueryClient();
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "markets" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            qc.invalidateQueries({ queryKey: JSON.parse(key) as unknown[] });
          }, 500);
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [key, channelName, qc]);
}
