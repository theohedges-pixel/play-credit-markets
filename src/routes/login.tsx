import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
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

// When "Remember me" is unchecked, move the persisted auth token from
// localStorage into sessionStorage so the session ends when the tab closes.
function makeSessionScoped() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) keys.push(k);
    }
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v != null) sessionStorage.setItem(k, v);
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(friendlyAuthError(error.message));
        return;
      }
      if (!remember) makeSessionScoped();
      toast.success("Welcome back");
      navigate({ to: "/markets" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect. Check your internet connection.";
      toast.error(friendlyAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const onGuest = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        toast.error(friendlyAuthError(error.message));
        return;
      }
      toast.success("Playing as guest — 1,000 credits to start.");
      navigate({ to: "/markets" });
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
