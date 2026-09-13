import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  kind: string;
  payload: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications" as any)
        .select("id, kind, payload, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as Notification[] | null) ?? [];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  if (!user) return null;
  const unread = (items ?? []).filter((n) => !n.read_at).length;

  const markAll = async () => {
    await supabase.rpc("mark_all_notifications_read" as any);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const renderItem = (n: Notification) => {
    const ts = formatDistanceToNow(new Date(n.created_at), { addSuffix: true });
    if (n.kind === "friend_request") {
      return (
        <Link
          to="/friends"
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>New friend request</div>
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    if (n.kind === "friend_accepted") {
      return (
        <Link
          to="/friends"
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>Friend request accepted</div>
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    if (n.kind === "group_bet_invite") {
      return (
        <Link
          to="/group-bets/$id"
          params={{ id: n.payload.group_bet_id }}
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>Invited to: {n.payload.title}</div>
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    if (n.kind === "group_bet_resolved") {
      return (
        <Link
          to="/group-bets/$id"
          params={{ id: n.payload.group_bet_id }}
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>
            Bet resolved: {n.payload.title} ({String(n.payload.resolution).toUpperCase()})
          </div>
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    if (n.kind === "market_resolution_proposed" || n.kind === "market_resolved") {
      const proposed = n.kind === "market_resolution_proposed";
      return (
        <Link
          to="/markets/$id"
          params={{ id: n.payload.market_id }}
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>
            {proposed ? "Proposed outcome" : "Market resolved"}{" "}
            {String(n.payload.resolution).toUpperCase()}: {n.payload.title}
          </div>
          {proposed && (
            <div className="text-xs text-muted-foreground">
              You have 24 hours to flag this before payout
            </div>
          )}
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    if (n.kind === "admin_granted" || n.kind === "admin_revoked") {
      const granted = n.kind === "admin_granted";
      return (
        <Link
          to="/admin/dashboard"
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>
            @{n.payload.actor_username} {granted ? "gave" : "removed"} admin access{" "}
            {granted ? "to" : "from"} @{n.payload.target_username}
          </div>
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    if (n.kind === "streak_bonus") {
      return (
        <Link
          to="/portfolio"
          onClick={() => setOpen(false)}
          className="block px-4 py-3 hover:bg-secondary/50 text-sm"
        >
          <div>
            🔥 {n.payload.streak}-day claim streak — {n.payload.bonus} bonus credits
          </div>
          <div className="text-xs text-muted-foreground">{ts}</div>
        </Link>
      );
    }
    return (
      <div className="px-4 py-3 text-sm">
        <div>{n.kind}</div>
        <div className="text-xs text-muted-foreground">{ts}</div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-auto divide-y divide-border">
          {items && items.length > 0 ? (
            items.map((n) => (
              <div key={n.id} className={n.read_at ? "opacity-60" : ""}>
                {renderItem(n)}
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-center text-muted-foreground">
              No notifications yet.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
