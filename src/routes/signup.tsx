import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { ref?: string; bet?: string } => {
    const r = typeof search.ref === "string" ? search.ref.slice(0, 40) : undefined;
    const b = typeof search.bet === "string" ? search.bet : undefined;
    return { ...(r ? { ref: r } : {}), ...(b ? { bet: b } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Create account — Predikt" },
      {
        name: "description",
        content: "Create a free Predikt account and start forecasting with credits — no real money.",
      },
      { property: "og:title", content: "Create account — Predikt" },
      {
        property: "og:description",
        content: "Create a free Predikt account and start forecasting with credits — no real money.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { ref: referrer, bet } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/markets`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: referrer ? { username, referrer_username: referrer } : { username },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      // If email confirmation is required, session will be null.
      // Make sure no session leaks into this tab either way.
      if (!data.session) {
        await supabase.auth.signOut().catch(() => {});
      }
      setSubmittedEmail(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect. Check your internet connection.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <div>
        <Header />
        <div className="max-w-md mx-auto px-6 py-20">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-bold mb-2">Check your email</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We sent a confirmation link to{" "}
              <span className="text-foreground font-medium">{submittedEmail}</span>. Click the
              link to activate your account, then sign in to claim your 1,000 credits.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate({ to: "/login" })}>Go to sign in</Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSubmittedEmail(null)}
              >
                Use a different email
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="max-w-md mx-auto px-6 py-20">
        <h1 className="font-display text-3xl font-bold mb-2">Create your account</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          {referrer
            ? `Invited by @${referrer} — start with 1,250 free credits. Claim 100 more every day.`
            : "Start with 1,000 free credits. Claim 100 more every day."}
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Username</Label>
            <Input
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="trader_99"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground mt-6 text-center">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
