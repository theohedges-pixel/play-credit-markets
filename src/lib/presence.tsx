import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface PresenceContextValue {
  online: Set<string>;
}

const PresenceContext = createContext<PresenceContextValue>({ online: new Set() });

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) {
      setOnline(new Set());
      return;
    }
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: user.id } },
    });

    const syncOnline = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      setOnline(new Set(Object.keys(state)));
    };

    channel
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <PresenceContext.Provider value={{ online }}>{children}</PresenceContext.Provider>
  );
}

export function useIsOnline(userId: string | null | undefined): boolean {
  const { online } = useContext(PresenceContext);
  if (!userId) return false;
  return online.has(userId);
}

export function useOnlineSet(): Set<string> {
  return useContext(PresenceContext).online;
}
