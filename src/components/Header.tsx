import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtCredits } from "@/lib/format";
import {
  Coins,
  TrendingUp,
  BarChart3,
  Trophy,
  Wallet,
  Users,
  Menu,
  GraduationCap,
  UsersRound,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TierBadge } from "@/components/TierBadge";
import { useNetWorth } from "@/lib/use-net-worth";

export function Header() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: standing } = useNetWorth();

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });

  const doSignOut = () => {
    setMoreOpen(false);
    signOut().then(() => navigate({ to: "/" }));
  };

  return (
    <>
      {!!user && <PendingResolutionsDialog />}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-8 min-w-0">
            <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl shrink-0">
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
                  <Link to="/learn" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                    Learn
                  </Link>
                  <Link to="/friends" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                    Friends
                  </Link>
                  <Link to="/group-bets" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                    Group bets
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin/dashboard"
                      className="hover:text-foreground flex items-center gap-1"
                      activeProps={{ className: "text-foreground" }}
                    >
                      <ShieldCheck size={14} className="text-primary" />
                      Admin
                    </Link>
                  )}
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <>
                <NotificationsBell />
                {profile ? (
                  <>
                    {/* Net worth is the headline figure (same view the
                        leaderboard ranks on); cash sits underneath it. */}
                    <Link
                      to="/achievements"
                      title={`${fmtCredits(standing?.net_worth ?? profile.credits)} net worth · ${fmtCredits(standing?.credits ?? profile.credits)} cash`}
                      className="flex flex-col items-end leading-tight px-2 sm:px-3 py-1 rounded-md bg-secondary font-mono hover:bg-secondary/70"
                    >
                      <span className="flex items-center gap-1.5 text-sm">
                        <Coins size={14} className="text-primary" />
                        {fmtCredits(standing?.net_worth ?? profile.credits)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {fmtCredits(standing?.credits ?? profile.credits)} cash
                      </span>
                    </Link>
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
                      <span className="hidden sm:inline">@{profile.username}</span>
                      <TierBadge peakNetWorth={standing?.peak_net_worth ?? (profile as any).peak_net_worth} />
                    </Link>
                  </>
                ) : (
                  <div className="h-8 w-16 sm:w-28 animate-pulse rounded-md bg-secondary" aria-label="Loading account" />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="hidden sm:inline-flex"
                  onClick={doSignOut}
                >
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

      {/* Mobile bottom tab bar */}
      {user && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="grid grid-cols-5 h-16">
            <TabLink to="/markets" icon={<BarChart3 size={20} />} label="Markets" />
            <TabLink to="/leaderboard" icon={<Trophy size={20} />} label="Ranks" />
            <TabLink to="/portfolio" icon={<Wallet size={20} />} label="Portfolio" />
            <TabLink to="/friends" icon={<Users size={20} />} label="Friends" />
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Menu size={20} />
              More
            </button>
          </div>
        </nav>
      )}

      {/* Spacer so the fixed bottom bar never covers page content on mobile */}
      {user && <div className="h-16 md:hidden" aria-hidden />}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="md:hidden">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col py-2">
            <MoreLink to="/learn" icon={<GraduationCap size={18} className="text-muted-foreground" />} label="Learn" onNavigate={() => setMoreOpen(false)} />
            <MoreLink to="/group-bets" icon={<UsersRound size={18} className="text-muted-foreground" />} label="Group bets" onNavigate={() => setMoreOpen(false)} />
            {isAdmin && (
              <MoreLink
                to="/admin/dashboard"
                icon={<ShieldCheck size={18} className="text-primary" />}
                label="Admin"
                onNavigate={() => setMoreOpen(false)}
              />
            )}
            <MoreLink to="/settings" icon={<Settings size={18} className="text-muted-foreground" />} label="Settings" onNavigate={() => setMoreOpen(false)} />
            <button
              type="button"
              onClick={doSignOut}
              className="flex items-center gap-3 px-2 py-3 rounded-md text-sm hover:bg-secondary/50 text-left"
            >
              <LogOut size={18} className="text-muted-foreground" />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-primary" }}
    >
      {icon}
      {label}
    </Link>
  );
}

function MoreLink({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-3 px-2 py-3 rounded-md text-sm hover:bg-secondary/50"
    >
      {icon}
      {label}
    </Link>
  );
}
