import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  GroupBetsExplainerCard,
  GroupBetsExplainerDialog,
} from "@/components/GroupBetsExplainer";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/group-bets/")({
  head: () => ({ meta: [{ title: "Group bets — Predikt" }] }),
  component: GroupBetsList,
});

interface Bet {
  id: string;
  title: string;
  closes_at: string;
  status: string;
  resolution: string | null;
  creator_id: string;
}

function GroupBetsList() {
  const { user } = useAuth();

  const { data: created } = useQuery({
    queryKey: ["gb-created", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("group_bets" as any)
        .select("id, title, closes_at, status, resolution, creator_id")
        .eq("creator_id", user!.id)
        .order("created_at", { ascending: false });
      return (data as unknown as Bet[] | null) ?? [];
    },
  });

  const { data: invitedIds } = useQuery({
    queryKey: ["gb-invited-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("group_bet_invites")
        .select("group_bet_id")
        .eq("invited_user_id", user!.id);
      return ((data ?? []) as Array<{ group_bet_id: string }>).map((r) => r.group_bet_id);
    },
  });

  const { data: participatingIds } = useQuery({
    queryKey: ["gb-part-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("group_bet_participants")
        .select("group_bet_id")
        .eq("user_id", user!.id);
      return ((data ?? []) as Array<{ group_bet_id: string }>).map((r) => r.group_bet_id);
    },
  });

  const idList = Array.from(new Set([...(invitedIds ?? []), ...(participatingIds ?? [])]));
  const { data: invitedBets } = useQuery({
    queryKey: ["gb-invited", idList.join(",")],
    enabled: idList.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("group_bets" as any)
        .select("id, title, closes_at, status, resolution, creator_id")
        .in("id", idList)
        .order("created_at", { ascending: false });
      return (data as unknown as Bet[] | null) ?? [];
    },
  });

  const participating = (invitedBets ?? []).filter((b) =>
    (participatingIds ?? []).includes(b.id),
  );
  const invited = (invitedBets ?? []).filter(
    (b) =>
      (invitedIds ?? []).includes(b.id) && !(participatingIds ?? []).includes(b.id),
  );

  const allBets = [...(created ?? []), ...(invitedBets ?? [])];
  const allIds = Array.from(new Set(allBets.map((b) => b.id))).sort();
  const { data: splits } = useQuery({
    queryKey: ["gb-splits", allIds.join(",")],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("group_bet_participants")
        .select("group_bet_id, side, credits_wagered")
        .in("group_bet_id", allIds);
      const map: Record<string, { yes: number; no: number }> = {};
      for (const row of (data ?? []) as Array<{ group_bet_id: string; side: string; credits_wagered: number }>) {
        const m = (map[row.group_bet_id] ??= { yes: 0, no: 0 });
        if (row.side === "yes") m.yes += Number(row.credits_wagered);
        else m.no += Number(row.credits_wagered);
      }
      return map;
    },
  });

  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold">Group bets</h1>
            <GroupBetsExplainerDialog />
          </div>
          <Button size="sm" asChild>
            <Link to="/group-bets/create">
              <Plus size={14} /> New bet
            </Link>
          </Button>
        </div>

        {allBets.length === 0 && (
          <div className="mb-6">
            <GroupBetsExplainerCard />
          </div>
        )}

        <Tabs defaultValue="participating">
          <TabsList>
            <TabsTrigger value="participating">
              Participating ({participating.length})
            </TabsTrigger>
            <TabsTrigger value="invited">Invited ({invited.length})</TabsTrigger>
            <TabsTrigger value="created">Created ({created?.length ?? 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="participating" className="mt-4">
            <BetList bets={participating} splits={splits} empty="You haven't joined any group bets yet." />
          </TabsContent>
          <TabsContent value="invited" className="mt-4">
            <BetList bets={invited} splits={splits} empty="No pending invites." />
          </TabsContent>
          <TabsContent value="created" className="mt-4">
            <BetList bets={created ?? []} splits={splits} empty="You haven't created any group bets." />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BetList({
  bets,
  splits,
  empty,
}: {
  bets: Bet[];
  splits?: Record<string, { yes: number; no: number }>;
  empty: string;
}) {
  if (bets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8 rounded-lg border border-border bg-card">
        {empty}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {bets.map((b) => {
        const s = splits?.[b.id];
        const pot = (s?.yes ?? 0) + (s?.no ?? 0);
        const yesPct = pot > 0 ? Math.round(((s?.yes ?? 0) / pot) * 100) : null;
        return (
        <Link
          key={b.id}
          to="/group-bets/$id"
          params={{ id: b.id }}
          className="block px-5 py-4 hover:bg-secondary/30"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium truncate">{b.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Closes {format(new Date(b.closes_at), "MMM d, yyyy")}
                {yesPct != null && (
                  <>
                    {" · "}
                    <span className="text-yes">{yesPct}% YES</span>
                    {" · "}
                    {pot.toLocaleString()}c pot
                  </>
                )}
              </div>
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {b.status === "resolved" && b.resolution
                ? `Resolved ${b.resolution}`
                : b.status === "voting"
                  ? "Awaiting votes"
                  : b.status === "pending_auto_resolution"
                    ? "Awaiting review"
                    : b.status}
            </span>
          </div>
        </Link>
        );
      })}
    </div>
  );
}
