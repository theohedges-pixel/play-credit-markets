import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { getInviter } from "@/lib/referrals.functions";

export const Route = createFileRoute("/join/$username")({
  loader: async ({ params }) => {
    const inviter = await getInviter({ data: { username: params.username } });
    if (!inviter) throw redirect({ to: "/signup" });
    return { inviter };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.inviter.username ?? "A friend";
    const title = `${name} invited you to Predikt`;
    const description = `Join Predikt free and claim 1,250 credits to start forecasting real-world events — no real money, ever.`;
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
  const { inviter } = Route.useLoaderData();

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
          <p className="text-sm text-muted-foreground mb-8">
            Sign up and claim <span className="text-foreground font-semibold">1,250 credits</span> to
            start forecasting elections, sports, crypto and pop culture. Free forever — no real money
            involved.
          </p>
          <Button asChild className="w-full">
            <Link to="/signup" search={{ ref: inviter.username }}>
              Sign up and claim 1,250 credits
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
