import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { MarketCard } from "@/components/MarketCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useMarketListRealtime } from "@/lib/realtime";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowUpDown } from "lucide-react";

const marketsSearchSchema = z.object({
  sort: fallback(z.string(), "active").default("active"),
});

const SORTS: Record<string, { label: string; order: (a: any, b: any) => number }> = {
  active: { label: "Most active", order: (a, b) => Number(b.volume) - Number(a.volume) },
  closing: { label: "Closing soon", order: (a, b) => new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime() },
  newest: { label: "Newest", order: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() },
};

export const Route = createFileRoute("/markets/")({
  validateSearch: zodValidator(marketsSearchSchema),
  head: () => ({
    meta: [
      { title: "Markets — Predikt" },
      { name: "description", content: "Browse all open prediction markets." },
    ],
  }),
  component: MarketsPage,
});

function MarketsPage() {
  const { sort } = Route.useSearch();
  const navigate = useNavigate({ from: "/markets/" });
  const sortKey = SORTS[sort] ? sort : "active";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  // Sub-theme chips only exist inside a chosen category, so the selection is
  // cleared whenever the category changes.
  const [themeIds, setThemeIds] = useState<string[]>([]);

  const pickCategory = (id: string | null) => {
    setCat(id);
    setThemeIds([]);
  };

  const { data: lastSync } = useQuery({
    queryKey: ["last-polymarket-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value, updated_at")
        .eq("key", "last_polymarket_sync")
        .maybeSingle();
      const v = data?.value as { at?: string } | null;
      return v?.at ?? data?.updated_at ?? null;
    },
    refetchInterval: 60_000,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, slug").order("name");
      return data ?? [];
    },
  });

  // AI-generated sub-themes for the selected category (rebuilt daily).
  const { data: themes } = useQuery({
    queryKey: ["market-themes", cat],
    enabled: !!cat,
    queryFn: async () => {
      const { data } = await supabase
        .from("market_themes")
        .select("id, name")
        .eq("category_id", cat!)
        .order("name");
      return data ?? [];
    },
  });

  // Market ids carrying any of the selected themes (OR across themes).
  const { data: themeMatchIds } = useQuery({
    queryKey: ["market-theme-tags", themeIds],
    enabled: themeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("market_theme_tags")
        .select("market_id")
        .in("theme_id", themeIds);
      return Array.from(new Set((data ?? []).map((r) => r.market_id)));
    },
  });

  const { data: markets, isLoading } = useQuery({
    queryKey: ["markets", q, cat, sortKey],
    queryFn: async () => {
      let query = supabase
        .from("markets")
        .select(
          "id, title, closes_at, created_at, yes_pool, no_pool, volume, status, resolution, source, created_via, category:categories(name)",
        )
        .eq("status", "open")
        .gt("closes_at", new Date().toISOString());
      if (sortKey === "active") query = query.order("volume", { ascending: false });
      else if (sortKey === "closing") query = query.order("closes_at", { ascending: true });
      else query = query.order("created_at", { ascending: false });
      if (cat) query = query.eq("category_id", cat);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data } = await query.limit(60);
      return data ?? [];
    },
  });

  useMarketListRealtime(["markets"], "markets:list");

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-bold mb-2">All markets</h1>
            <p className="text-muted-foreground">Pick a question, take a side.</p>
          </div>
          {lastSync && (
            <span className="text-xs text-muted-foreground">
              Last synced {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
            </span>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search markets…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          <Select
            value={sortKey}
            onValueChange={(v) =>
              navigate({ search: (prev) => ({ ...prev, sort: v }), replace: true })
            }
          >
            <SelectTrigger className="w-[170px] h-8 text-sm">
              <ArrowUpDown size={14} className="text-muted-foreground shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([key, s]) => (
                <SelectItem key={key} value={key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => pickCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm border ${!cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {categories?.map((c) => (
            <button
              key={c.id}
              onClick={() => pickCategory(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm border ${cat === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-5 animate-pulse">
                <div className="h-3 w-20 bg-secondary rounded mb-3" />
                <div className="h-5 w-full bg-secondary rounded mb-2" />
                <div className="h-5 w-3/4 bg-secondary rounded mb-6" />
                <div className="flex items-baseline justify-between mb-3">
                  <div className="h-8 w-16 bg-secondary rounded" />
                  <div className="h-3 w-20 bg-secondary rounded" />
                </div>
                <div className="h-2 w-full bg-secondary rounded" />
              </div>
            ))}
          </div>
        ) : markets && markets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...markets].sort(SORTS[sortKey].order).map((m) => <MarketCard key={m.id} m={m} />)}
          </div>
        ) : (
          <div className="text-muted-foreground py-12 text-center">No markets match.</div>
        )}
      </div>
    </div>
  );
}
