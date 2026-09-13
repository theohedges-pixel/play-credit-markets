import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { setPendingBet } from "@/lib/pending-bet";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { bet?: string; sharer?: string } => {
    const b = typeof search.bet === "string" ? search.bet : undefined;
    const s = typeof search.sharer === "string" ? search.sharer.slice(0, 40) : undefined;
    return { ...(b ? { bet: b } : {}), ...(s ? { sharer: s } : {}) };
  },
  head: () => ({ meta: [{ title: "Sign in — Predikt" }] }),
  component: LoginPage,
});

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email before signing in. Check your inbox for the confirmation link.";
  }
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("networkerror")) {
    return "Could not connect. Check your internet connection.";
  }
  return message;
}

// When "Remember me" is unchecked, sign out automatically when the tab closes.
// (The session itself must stay in the client's own storage — moving the token
// elsewhere breaks the session immediately after sign-in.)
function markSessionOnly() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("predikt-session-only", "1");
  } catch {
    /* ignore */
  }
}

function clearSessionOnlyFlag() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("predikt-session-only");
  } catch {
    /* ignore */
  }
}


function LoginPage() {
  const navigate = useNavigate();
  const { bet, sharer } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(friendlyAuthError(error.message));
        return;
      }
      if (!data.session || !data.user) {
        toast.error("Sign-in did not create a session. Please try again.");
        return;
      }
      if (remember) clearSessionOnlyFlag();
      else markSessionOnly();

      toast.success("Welcome back");
      if (bet && sharer) {
        // Redeemed by <PendingBetJoin />, which then lands them on the bet page.
        setPendingBet({ betId: bet, sharer });
        return;
      }
      await navigate({ to: "/markets" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect. Check your internet connection.";
      toast.error(friendlyAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-md mx-auto px-6 py-20">
        <h1 className="font-display text-3xl font-bold mb-2">Sign in</h1>
        <p className="text-muted-foreground mb-8 text-sm">Welcome back to Predikt.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
            />
            Remember me on this device
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground mt-6 text-center">
          New here? <Link to="/signup" className="text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
