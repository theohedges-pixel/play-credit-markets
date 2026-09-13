import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/group-bets/create")({
  head: () => ({ meta: [{ title: "New group bet — Predikt" }] }),
  component: CreateGroupBet,
});

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

function CreateGroupBet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: friends } = useQuery({
    queryKey: ["gb-friend-picker", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships" as any)
        .select(
          "requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)",
        )
        .eq("status", "accepted");
      const list: Friend[] = [];
      for (const r of (data ?? []) as any[]) {
        const o = r.requester_id === user!.id ? r.addressee : r.requester;
        if (o) list.push(o);
      }
      return list;
    },
  });

  const toggle = (id: string) => {
    const s = new Set(picked);
    if (s.has(id)) s.delete(id); else s.add(id);
    setPicked(s);
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!closesAt) return toast.error("Close date is required");
    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_group_bet" as any, {
      _title: title.trim(),
      _description: description.trim() || null,
      _closes_at: new Date(closesAt).toISOString(),
      _friend_ids: Array.from(picked),
      _resolution_source: resolutionSource.trim() || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Group bet created");
    navigate({
      to: "/group-bets/$id",
      params: { id: data as string },
      search: { new: "1" },
    });
  };

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-5">
        <h1 className="font-display text-3xl font-bold">New group bet</h1>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Will the Lakers win on Friday?"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="How will this resolve?"
            className="mt-1"
            rows={3}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Closes at</label>
          <Input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            How can this be verified? (optional)
          </label>
          <Textarea
            value={resolutionSource}
            onChange={(e) => setResolutionSource(e.target.value)}
            placeholder="e.g. The official NBA box score for the Lakers vs Suns game on Friday"
            className="mt-1"
            rows={2}
          />
          <p className="text-xs text-muted-foreground mt-1">
            If you add this, we'll try to work out the outcome automatically when the bet closes —
            everyone gets 24 hours to flag it before credits move.
          </p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Invite friends ({picked.size})
          </label>
          <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-64 overflow-auto">
            {!friends || friends.length === 0 ? (
              <p className="px-5 py-6 text-sm text-center text-muted-foreground">
                Add friends first to invite them.
              </p>
            ) : (
              friends.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-secondary/30"
                >
                  <Checkbox
                    checked={picked.has(f.id)}
                    onCheckedChange={() => toggle(f.id)}
                  />
                  <UserAvatar username={f.username} avatarUrl={f.avatar_url} userId={f.id} size="sm" />
                  <span className="text-sm">@{f.username}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create bet"}
        </Button>
      </div>
    </div>
  );
}
