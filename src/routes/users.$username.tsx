import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/users/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Predikt` },
      { name: "description", content: `Predikt profile for @${params.username}` },
    ],
  }),
  component: PublicProfile,
});

function PublicProfile() {
  const { username } = Route.useParams();
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("public_profiles")
        .select("id, username, avatar_url, bio, created_at")
        .eq("username", username)
        .maybeSingle();
      return data as {
        id: string;
        username: string;
        avatar_url: string | null;
        bio: string | null;
        created_at: string;
      } | null;
    },
  });

  const uid = profile?.id;
  const isOwnProfile = !!me && me.id === uid;

  // NOTE: positions/trades are private (owner-only RLS) — no cross-user
  // holdings or activity queries here.

  const { data: marketsCreated } = useQuery({
    queryKey: ["public-markets-created", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { count } = await supabase
        .from("markets")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", uid!);
      return count ?? 0;
    },
  });

  const { data: friendCount } = useQuery({
    queryKey: ["public-friend-count", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      return count ?? 0;
    },
  });

  const { data: friendship, refetch: refetchFriendship } = useQuery({
    queryKey: ["friendship-with", me?.id, uid],
    enabled: !!me && !!uid && me.id !== uid,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${me!.id},addressee_id.eq.${uid}),and(requester_id.eq.${uid},addressee_id.eq.${me!.id})`,
        )
        .maybeSingle();
      return data as
        | { id: string; status: "pending" | "accepted" | "declined"; requester_id: string; addressee_id: string }
        | null;
    },
  });

  const sendRequest = async () => {
    if (!uid) return;
    const { error } = await supabase.rpc("send_friend_request" as any, { _addressee_id: uid });
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    refetchFriendship();
  };

  const acceptRequest = async () => {
    if (!friendship) return;
    const { error } = await supabase.rpc("respond_to_friend_request" as any, {
      _friendship_id: friendship.id,
      _accept: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Friends!");
    refetchFriendship();
    qc.invalidateQueries({ queryKey: ["public-friend-count", uid] });
  };

  const removeFriend = async () => {
    if (!friendship) return;
    const { error } = await supabase.rpc("remove_friend" as any, { _friendship_id: friendship.id });
    if (error) return toast.error(error.message);
    toast.success("Removed");
    refetchFriendship();
    qc.invalidateQueries({ queryKey: ["public-friend-count", uid] });
  };


  if (isLoading) {
    return (
      <div>
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-10 animate-pulse">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-24 w-24 rounded-full bg-secondary" />
            <div className="space-y-2">
              <div className="h-6 w-40 bg-secondary rounded" />
              <div className="h-3 w-32 bg-secondary rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h1 className="font-display text-3xl font-bold mb-2">User not found</h1>
          <p className="text-muted-foreground">
            No one trades under @{username}.{" "}
            <Link to="/leaderboard" className="text-primary hover:underline">
              See the leaderboard
            </Link>
          </p>
        </div>
      </div>
    );
  }


  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-start gap-5 mb-8 flex-wrap">
          <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} userId={profile.id} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-3xl font-bold">@{profile.username}</h1>
              {me && me.id !== profile.id && (
                <>
                  {!friendship && (
                    <Button size="sm" onClick={sendRequest}>Add friend</Button>
                  )}
                  {friendship?.status === "pending" && friendship.requester_id === me.id && (
                    <Button size="sm" variant="secondary" disabled>Request sent</Button>
                  )}
                  {friendship?.status === "pending" && friendship.addressee_id === me.id && (
                    <Button size="sm" onClick={acceptRequest}>Accept request</Button>
                  )}
                  {friendship?.status === "accepted" && (
                    <Button size="sm" variant="secondary" onClick={removeFriend}>Friends ✓</Button>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Member since {format(new Date(profile.created_at), "MMMM yyyy")}
            </p>
            {profile.bio && <p className="mt-3 text-sm max-w-xl">{profile.bio}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <Stat label="Markets created" value={String(marketsCreated ?? 0)} />
          <Stat label="Friends" value={String(friendCount ?? 0)} />
        </div>

        <p className="text-xs text-muted-foreground">
          Holdings and trade history are private — check the{" "}
          <Link to="/leaderboard" className="text-primary hover:underline">
            leaderboard
          </Link>{" "}
          for public rankings.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
