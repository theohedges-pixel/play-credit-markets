import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { MarketCard } from "@/components/MarketCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, Loader2, RefreshCw, Brain } from "lucide-react";
import { toast } from "sonner";
import { importPolymarketMarkets } from "@/lib/polymarket.functions";
import { useMarketListRealtime } from "@/lib/realtime";

export const Route = createFileRoute("/markets/")({
  head: () => ({
    meta: [
      { title: "Markets — Predikt" },
      { name: "description", content: "Browse all open prediction markets." },
    ],
  }),
  component: MarketsPage,
});

function MarketsPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [genAi, setGenAi] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const runImport = useServerFn(importPolymarketMarkets);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });

  const { data: lastSync, refetch: refetchSync } = useQuery({
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

  const onImport = async () => {
    setImporting(true);
    try {
      const res = await runImport();
      toast.success(res.message ?? `Imported ${res.imported} markets`);
      qc.invalidateQueries({ queryKey: ["markets"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const onSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/public/hooks/sync-polymarket", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Sync failed");
      toast.success(`Synced: ${body.inserted} added, ${body.closed} closed`);
      qc.invalidateQueries({ queryKey: ["markets"] });
      refetchSync();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const onGenerateAi = async () => {
    setGenAi(true);
    try {
      const res = await fetch("/api/public/hooks/generate-ai-markets", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "AI generation failed");
      toast.success(`Created ${body.inserted} new AI market${body.inserted === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["markets"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setGenAi(false);
    }
  };

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, slug").order("name");
      return data ?? [];
    },
  });

  const { data: markets, isLoading } = useQuery({
    queryKey: ["markets", q, cat],
    queryFn: async () => {
      let query = supabase
        .from("markets")
        .select(
          "id, title, closes_at, yes_pool, no_pool, volume, status, resolution, source, created_via, category:categories(name)",
        )
        .eq("status", "open")
        .gt("closes_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (cat) query = query.eq("category_id", cat);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data } = await query.limit(60);
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-bold mb-2">All markets</h1>
            <p className="text-muted-foreground">Pick a question, take a side.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {lastSync && (
              <span className="text-xs text-muted-foreground">
                Last synced {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
              </span>
            )}
            {isAdmin && (
              <>
                <Link to="/admin/suggestions">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Sparkles size={14} className="text-primary" />
                    Suggestions
                  </Button>
                </Link>
                <Button onClick={onSyncNow} disabled={syncing} variant="outline" size="sm" className="gap-2">
                  {syncing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
                <Button onClick={onGenerateAi} disabled={genAi} variant="outline" size="sm" className="gap-2">
                  {genAi ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Brain size={14} />
                  )}
                  {genAi ? "Generating…" : "Generate AI markets"}
                </Button>
              </>
            )}
            {user && (
              <Button onClick={onImport} disabled={importing} variant="outline" className="gap-2">
                {importing ? (
                  <Loader2 size={14} className="animate-spin text-primary" />
                ) : (
                  <Sparkles size={14} className="text-primary" />
                )}
                {importing ? "Importing…" : "Import from Polymarket"}
              </Button>
            )}
          </div>
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

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setCat(null)}
            className={`px-3 py-1.5 rounded-full text-sm border ${!cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {categories?.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
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
            {markets.map((m) => <MarketCard key={m.id} m={m} />)}
          </div>
        ) : (
          <div className="text-muted-foreground py-12 text-center">No markets match.</div>
        )}
      </div>
    </div>
  );
}
