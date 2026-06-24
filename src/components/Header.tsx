import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { fmtCredits } from "@/lib/format";
import { Coins, TrendingUp } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { NotificationsBell } from "@/components/NotificationsBell";

export function Header() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <TrendingUp className="text-primary" size={22} />
            <span>Predikt</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/markets" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              Markets
            </Link>
            <Link to="/leaderboard" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              Leaderboard
            </Link>
            {user && (
              <>
                <Link to="/portfolio" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                  Portfolio
                </Link>
                <Link to="/create" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                  Create
                </Link>
                <Link to="/learn" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                  Learn
                </Link>
                <Link to="/friends" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                  Friends
                </Link>
                <Link to="/group-bets" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                  Group bets
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user && profile ? (
            <>
              <NotificationsBell />
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-sm font-mono">
                <Coins size={14} className="text-primary" />
                <span>{fmtCredits(profile.credits)}</span>
              </div>
              <Link
                to="/settings"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <UserAvatar
                  username={profile.username}
                  avatarUrl={profile.avatar_url}
                  userId={user.id}
                  size="sm"
                />
                @{profile.username}
              </Link>
              <Button size="sm" variant="ghost" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button size="sm" variant="ghost">Sign in</Button>
              </Link>
              <Link to="/signup">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
