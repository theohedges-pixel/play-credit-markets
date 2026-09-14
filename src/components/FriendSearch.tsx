import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { Search } from "lucide-react";

interface Result {
  id: string;
  username: string;
  avatar_url: string | null;
  rel: "none" | "sent" | "incoming" | "friends";
  friendship_id: string | null;
}

export function FriendSearch() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["user-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("search_users", { _q: debounced });
      if (error) throw error;
      return (data ?? []) as Result[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["user-search"] });
    qc.invalidateQueries({ queryKey: ["friendships"] });
  };

  const add = async (id: string) => {
    const { error } = await (supabase as any).rpc("send_friend_request", { _addressee_id: id });
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    refresh();
  };

  const accept = async (friendshipId: string) => {
    const { error } = await (supabase as any).rpc("respond_to_friend_request", {
      _friendship_id: friendshipId,
      _accept: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Friends!");
    refresh();
  };

  return (
    <div className="mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search members by username"
          className="pl-9"
          aria-label="Search members by username"
        />
      </div>

      {debounced.length >= 2 && (
        <div className="mt-3 rounded-lg border border-border bg-card divide-y divide-border">
          {isFetching && !results && (
            <p className="px-5 py-4 text-sm text-muted-foreground">Searching…</p>
          )}
          {results && results.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              No members found for "{debounced}".
            </p>
          )}
          {(results ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <Link
                to="/users/$username"
                params={{ username: r.username }}
                className="flex items-center gap-3 min-w-0"
              >
                <UserAvatar username={r.username} avatarUrl={r.avatar_url} userId={r.id} size="md" />
                <span className="truncate">@{r.username}</span>
              </Link>
              {r.rel === "none" && (
                <Button size="sm" onClick={() => add(r.id)}>
                  Add friend
                </Button>
              )}
              {r.rel === "sent" && (
                <Button size="sm" variant="secondary" disabled>
                  Pending
                </Button>
              )}
              {r.rel === "incoming" && r.friendship_id && (
                <Button size="sm" onClick={() => accept(r.friendship_id!)}>
                  Accept
                </Button>
              )}
              {r.rel === "friends" && (
                <Button size="sm" variant="secondary" disabled>
                  Friends
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {term.trim().length === 1 && (
        <p className="mt-2 text-xs text-muted-foreground">Type at least 2 characters.</p>
      )}
    </div>
  );
}
