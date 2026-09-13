import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold">Group bets</h1>
          <Button size="sm" asChild>
            <Link to="/group-bets/create">
              <Plus size={14} /> New bet
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="participating">
          <TabsList>
            <TabsTrigger value="participating">
              Participating ({participating.length})
            </TabsTrigger>
            <TabsTrigger value="invited">Invited ({invited.length})</TabsTrigger>
            <TabsTrigger value="created">Created ({created?.length ?? 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="participating" className="mt-4">
            <BetList bets={participating} empty="You haven't joined any group bets yet." />
          </TabsContent>
          <TabsContent value="invited" className="mt-4">
            <BetList bets={invited} empty="No pending invites." />
          </TabsContent>
          <TabsContent value="created" className="mt-4">
            <BetList bets={created ?? []} empty="You haven't created any group bets." />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BetList({ bets, empty }: { bets: Bet[]; empty: string }) {
  if (bets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8 rounded-lg border border-border bg-card">
        {empty}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {bets.map((b) => (
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
      ))}
    </div>
  );
}
