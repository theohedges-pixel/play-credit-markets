import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { InviteFriends } from "@/components/InviteFriends";
import { FriendSearch } from "@/components/FriendSearch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — Predikt" }] }),
  component: FriendsPage,
});

interface Row {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  requester: { id: string; username: string; avatar_url: string | null } | null;
  addressee: { id: string; username: string; avatar_url: string | null } | null;
}

function FriendsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["friendships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships" as any)
        .select(
          "id, requester_id, addressee_id, status, requester:public_profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:public_profiles!friendships_addressee_id_fkey(id, username, avatar_url)",
        );
      return (data as unknown as Row[] | null) ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["friendships", user?.id] });

  const respond = async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc("respond_to_friend_request" as any, {
      _friendship_id: id,
      _accept: accept,
    });
    if (error) return toast.error(error.message);
    toast.success(accept ? "Friend added" : "Request declined");
    invalidate();
  };

  const block = async (userId: string, username: string) => {
    if (!window.confirm(`Block @${username}? They won't be able to send you requests.`)) return;
    const { error } = await (supabase as any).rpc("block_user", { _user_id: userId });
    if (error) return toast.error(error.message);
    toast.success(`@${username} blocked`);
    invalidate();
    qc.invalidateQueries({ queryKey: ["blocked-users"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.rpc("remove_friend" as any, { _friendship_id: id });
    if (error) return toast.error(error.message);
    toast.success("Removed");
    invalidate();
  };

  const accepted = (rows ?? []).filter((r) => r.status === "accepted");
  const incoming = (rows ?? []).filter(
    (r) => r.status === "pending" && r.addressee_id === user?.id,
  );
  const outgoing = (rows ?? []).filter(
    (r) => r.status === "pending" && r.requester_id === user?.id,
  );

  const otherOf = (r: Row) =>
    r.requester_id === user?.id ? r.addressee : r.requester;

  return (
    <div>
      <Header />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-display text-3xl font-bold mb-6">Friends</h1>

        <InviteFriends />

        <Tabs defaultValue="friends">
          <TabsList>
            <TabsTrigger value="friends">My friends ({accepted.length})</TabsTrigger>
            <TabsTrigger value="requests">Requests ({incoming.length})</TabsTrigger>
            <TabsTrigger value="sent">Sent ({outgoing.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="mt-4">
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {accepted.length === 0 && (
                <p className="px-5 py-8 text-sm text-center text-muted-foreground">
                  No friends yet. Visit a profile and send a friend request.
                </p>
              )}
              {accepted.map((r) => {
                const o = otherOf(r);
                if (!o) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <Link
                      to="/users/$username"
                      params={{ username: o.username }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <UserAvatar username={o.username} avatarUrl={o.avatar_url} userId={o.id} size="md" />
                      <span className="truncate">@{o.username}</span>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {incoming.length === 0 && (
                <p className="px-5 py-8 text-sm text-center text-muted-foreground">
                  No pending requests.
                </p>
              )}
              {incoming.map((r) => {
                const o = r.requester;
                if (!o) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <Link
                      to="/users/$username"
                      params={{ username: o.username }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <UserAvatar username={o.username} avatarUrl={o.avatar_url} userId={o.id} size="md" />
                      <span className="truncate">@{o.username}</span>
                    </Link>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respond(r.id, true)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => respond(r.id, false)}>
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {outgoing.length === 0 && (
                <p className="px-5 py-8 text-sm text-center text-muted-foreground">
                  No outgoing requests.
                </p>
              )}
              {outgoing.map((r) => {
                const o = r.addressee;
                if (!o) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <Link
                      to="/users/$username"
                      params={{ username: o.username }}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <UserAvatar username={o.username} avatarUrl={o.avatar_url} userId={o.id} size="md" />
                      <span className="truncate">@{o.username}</span>
                    </Link>
                    <span className="text-xs text-muted-foreground">Pending</span>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
