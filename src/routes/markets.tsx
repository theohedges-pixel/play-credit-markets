import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { MarketCard, type MarketCardData } from "@/components/MarketCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/markets")({
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
        .select("id, title, closes_at, yes_pool, no_pool, volume, status, resolution, category:categories(name)")
        .order("created_at", { ascending: false });
      if (cat) query = query.eq("category_id", cat);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data } = await query.limit(60);
      return (data ?? []) as unknown as MarketCardData[];
    },
  });

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="font-display text-4xl font-bold mb-2">All markets</h1>
        <p className="text-muted-foreground mb-8">Pick a question, take a side.</p>

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
          <div className="text-muted-foreground">Loading…</div>
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
