import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  username: string;
  credits: number;
  avatar_url: string | null;
  bio: string | null;
  last_daily_claim: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// One referral-reward attempt per user per page load.
const claimedReferral = new Set<string>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    // Pay out a pending invite reward to whoever invited this user, now that
    // their email is confirmed (the RPC checks confirmation server-side).
    if (!claimedReferral.has(uid)) {
      claimedReferral.add(uid);
      try {
        await (supabase as any).rpc("claim_referral_reward");
      } catch {
        /* ignore */
      }
    }
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, username, credits, avatar_url, bio, last_daily_claim, peak_net_worth, trading_history_public")
      .eq("id", uid)
      .maybeSingle();
    setProfile(data ? { ...data, credits: Number(data.credits) } : null);
  };

  useEffect(() => {
    // Recover sessions stranded in sessionStorage by an earlier "remember me"
    // implementation, so users aren't signed out right after signing in.
    if (typeof window !== "undefined") {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith("sb-") && k.endsWith("-auth-token") && !localStorage.getItem(k)) {
            const v = sessionStorage.getItem(k);
            if (v != null) localStorage.setItem(k, v);
          }
        }
      } catch {
        /* ignore */
      }
    }

    let active = true;
    let receivedAuthEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      receivedAuthEvent = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active || receivedAuthEvent) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    // Read the current session directly so the call is reliable even if React
    // state hasn't flushed yet (e.g. right after sign-in or a fast trade).
    const { data: { session: s } } = await supabase.auth.getSession();
    const uid = s?.user?.id ?? user?.id;
    if (uid) await loadProfile(uid);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
