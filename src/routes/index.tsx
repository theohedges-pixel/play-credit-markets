import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { MarketCard, type MarketCardData } from "@/components/MarketCard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Trophy } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { data: markets } = useQuery({
    queryKey: ["trending-markets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("markets")
        .select("id, title, closes_at, yes_pool, no_pool, volume, status, resolution, category:categories(name)")
        .eq("status", "open")
        .order("volume", { ascending: false })
        .limit(6);
      return (data ?? []) as unknown as MarketCardData[];
    },
  });

  return (
    <div className="min-h-screen">
      <Header />
      {/* Hero */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
              <Sparkles size={12} /> 100% free · No real money
            </div>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
              Bet on what's <span className="text-primary">next.</span>
              <br />
              With credits, not cash.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl">
              A prediction market for politics, sports, crypto, and culture — powered by free
              in-app credits. Build a portfolio of beliefs and climb the leaderboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/markets">
                <Button size="lg" className="gap-2">
                  Explore markets <ArrowRight size={16} />
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="lg" variant="outline">
                  Claim 1,000 credits
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl">
            <Stat icon={<Zap size={18} />} label="Starting bankroll" value="1,000 credits" />
            <Stat icon={<Sparkles size={18} />} label="Daily refill" value="+100 / day" />
            <Stat icon={<Trophy size={18} />} label="Compete on the" value="Leaderboard" />
          </div>
        </div>
      </section>

      {/* Trending markets */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl font-bold">Trending markets</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              The most-traded questions right now.
            </p>
          </div>
          <Link to="/markets" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        {markets && markets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((m) => <MarketCard key={m.id} m={m} />)}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No markets yet. Check back soon.</p>
          </div>
        )}
      </section>

      <footer className="border-t border-border mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 text-sm text-muted-foreground flex flex-wrap justify-between gap-4">
          <div>© Predikt — for entertainment only.</div>
          <div className="font-mono text-xs">No real money is wagered or won.</div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-primary mb-2">{icon}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-semibold text-lg mt-1">{value}</div>
    </div>
  );
}
