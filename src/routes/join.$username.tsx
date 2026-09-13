import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";
import { clearPendingBet, joinViaLink, setPendingBet } from "@/lib/pending-bet";
import { getGroupBetPreview, getInviter, type GroupBetPreview } from "@/lib/referrals.functions";

export const Route = createFileRoute("/join/$username")({
  validateSearch: (search: Record<string, unknown>): { bet?: string } => {
    const b = typeof search.bet === "string" ? search.bet : undefined;
    return b ? { bet: b } : {};
  },
  loaderDeps: ({ search }) => ({ bet: search.bet }),
  loader: async ({ params, deps }) => {
    const inviter = await getInviter({ data: { username: params.username } });
    if (!inviter) throw redirect({ to: "/signup" });
    let bet: GroupBetPreview | null = null;
    if (deps.bet) {
      try {
        bet = await getGroupBetPreview({ data: { betId: deps.bet } });
      } catch {
        bet = null; // closed, resolved, malformed id — fall back to referral-only
      }
    }
    return { inviter, bet };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.inviter.username ?? "A friend";
    const title = loaderData?.bet
      ? `${name} invited you to bet on: ${loaderData.bet.title}`
      : `${name} invited you to Predikt`;
    const description =
      "Join Predikt free and claim 1,250 credits to start forecasting real-world events — no real money, ever.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <div className="max-w-md mx-auto px-6 py-20 text-center text-muted-foreground">
      Could not load this invite.{" "}
      <Link to="/signup" className="text-primary hover:underline">Sign up anyway</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="max-w-md mx-auto px-6 py-20 text-center text-muted-foreground">
      Invite not found.
    </div>
  ),
  component: JoinPage,
});

function JoinPage() {
  const { inviter, bet } = Route.useLoaderData();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  const isSelf = !!user && user.id === inviter.id;

  // Signed-in visitor following a bet link: redeem it right here.
  const joinNow = async () => {
    if (!bet) return;
    setWorking(true);
    const err = await joinViaLink(bet.id, inviter.username);
    setWorking(false);
    if (err) {
      toast.error(err);
      return;
    }
    clearPendingBet();
    toast.success("You've been added to the bet");
    navigate({ to: "/group-bets/$id", params: { id: bet.id } });
  };

  const rememberBet = () => {
    if (bet) setPendingBet({ betId: bet.id, sharer: inviter.username });
  };

  return (
    <div>
      <Header />
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <UserAvatar
            username={inviter.username}
            avatarUrl={inviter.avatar_url}
            userId={inviter.id}
            size="xl"
            className="mx-auto mb-5"
          />
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary mb-3">
            You're invited
          </div>
          <h1 className="font-display text-3xl font-bold mb-3">
            @{inviter.username} invited you to Predikt
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Sign up and claim <span className="text-foreground font-semibold">1,250 credits</span> to
            start forecasting elections, sports, crypto and pop culture. Free forever — no real money
            involved.
          </p>

          {bet && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-5 text-left mb-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
                …and bet with them on
              </div>
              <div className="font-display text-lg font-semibold leading-snug">{bet.title}</div>
              {bet.description && (
                <p className="text-sm text-muted-foreground mt-2">{bet.description}</p>
              )}
              <div className="text-xs text-muted-foreground mt-3">
                Closes {format(new Date(bet.closes_at), "MMM d, yyyy HH:mm")}
              </div>
            </div>
          )}

          {user ? (
            bet ? (
              isSelf ? (
                <Button
                  className="w-full"
                  onClick={() => navigate({ to: "/group-bets/$id", params: { id: bet.id } })}
                >
                  Go to your bet
                </Button>
              ) : (
                <Button className="w-full" onClick={joinNow} disabled={working}>
                  {working ? "Joining…" : "Join this bet"}
                </Button>
              )
            ) : (
              <Button className="w-full" onClick={() => navigate({ to: "/markets" })}>
                {profile ? "Browse markets" : "Continue"}
              </Button>
            )
          ) : (
            <>
              <Button asChild className="w-full" onClick={rememberBet}>
                <Link
                  to="/signup"
                  search={bet ? { ref: inviter.username, bet: bet.id } : { ref: inviter.username }}
                >
                  {bet ? "Sign up and join this bet" : "Sign up and claim 1,250 credits"}
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Already have an account?{" "}
                <Link
                  to="/login"
                  search={bet ? { bet: bet.id, sharer: inviter.username } : {}}
                  onClick={rememberBet}
                  className="text-primary hover:underline"
                >
                  Log in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
