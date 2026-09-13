import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { fmtCredits } from "@/lib/format";
import { sendPasswordReset } from "@/lib/admin.functions";
import {
  syncPolymarketNow,
  generateAiMarketsNow,
  discoverTrendingNow,
  resolveAiMarketsNow,
  approveSuggestionChecked,
  backfillPolymarketHistoryNow,
} from "@/lib/admin-jobs.functions";
import { toast } from "sonner";
import {
  ShieldCheck,
  Sparkles,
  Loader2,
  RefreshCw,
  Brain,
  Trash2,
  KeyRound,
  Gavel,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — Predikt" },
      { name: "description", content: "Manage admins, users, markets and activity on Predikt." },
      { property: "og:title", content: "Admin dashboard — Predikt" },
      { property: "og:description", content: "Internal admin tools for Predikt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboard,
});

const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args);

function AdminDashboard() {
  const { user } = useAuth();

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
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

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/markets" />;

  return (
    <div>
      <Header />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="text-primary" size={22} />
          <h1 className="font-display text-3xl sm:text-4xl font-bold">Admin</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          Manage access, users, markets and platform activity.
        </p>

        <Tabs defaultValue="admins">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="admins">Admins</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
          </TabsList>

          <TabsContent value="admins" className="pt-6">
            <AdminsTab meId={user!.id} />
          </TabsContent>
          <TabsContent value="users" className="pt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="markets" className="pt-6">
            <MarketsTab />
          </TabsContent>
          <TabsContent value="activity" className="pt-6">
            <ActivityTab />
          </TabsContent>
          <TabsContent value="audit" className="pt-6">
            <AuditTab />
          </TabsContent>
          <TabsContent value="suggestions" className="pt-6">
            <SuggestionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ---------------------------------- Admins --------------------------------- */

interface AdminRow {
  user_id: string;
  username: string;
  avatar_url: string | null;
  granted_at: string;
}

function AdminsTab({ meId }: { meId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: admins, isLoading } = useQuery({
    queryKey: ["admin-admins"],
    queryFn: async () => {
      const { data, error } = await rpc("admin_list_admins");
      if (error) throw error;
      return (data ?? []) as AdminRow[];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["admin-user-search", search],
    enabled: search.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await rpc("admin_list_users", {
        _search: search.trim(),
        _limit: 8,
        _offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; username: string; is_admin: boolean }>;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-admins"] });
    qc.invalidateQueries({ queryKey: ["admin-user-search"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  const grant = async (id: string, username: string) => {
    setBusy(id);
    const { error } = await rpc("admin_grant_admin", { _target_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`@${username} is now an admin — all other admins notified`);
    refresh();
  };

  const revoke = async (id: string, username: string) => {
    setBusy(id);
    const { error } = await rpc("admin_revoke_admin", { _target_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Removed admin access from @${username} — all other admins notified`);
    refresh();
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Current admins</h2>
        {isLoading ? (
          <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {(admins ?? []).map((a) => (
              <div key={a.user_id} className="flex items-center gap-3 p-3">
                <UserAvatar username={a.username} avatarUrl={a.avatar_url} userId={a.user_id} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    @{a.username}
                    {a.user_id === meId && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">YOU</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Granted {format(new Date(a.granted_at), "PP")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={a.user_id === meId || busy === a.user_id || (admins ?? []).length <= 1}
                  onClick={() => revoke(a.user_id, a.username)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Every other admin is notified immediately whenever admin access is granted or revoked.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Grant admin</h2>
        <Input
          placeholder="Search by username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {search.trim() && (
          <div className="mt-3 rounded-lg border border-border bg-card divide-y divide-border max-w-xl">
            {(candidates ?? []).length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No matching users.</div>
            ) : (
              (candidates ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <span className="text-sm flex-1 truncate">@{c.username}</span>
                  {c.is_admin ? (
                    <span className="text-xs text-muted-foreground">Already admin</span>
                  ) : (
                    <Button size="sm" disabled={busy === c.id} onClick={() => grant(c.id, c.username)}>
                      {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : "Grant admin"}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ----------------------------------- Users ---------------------------------- */

interface UserRow {
  id: string;
  username: string;
  created_at: string;
  credits: number;
  net_worth: number;
  email_confirmed: boolean;
  is_admin: boolean;
  total_count: number;
}

const PAGE = 20;

function UsersTab() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", q, page],
    queryFn: async () => {
      const { data, error } = await rpc("admin_list_users", {
        _search: q.trim(),
        _limit: PAGE,
        _offset: page * PAGE,
      });
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const total = data?.[0]?.total_count ? Number(data[0].total_count) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <Input
        placeholder="Search users…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
        className="max-w-sm mb-4"
      />

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="text-right">Net worth</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(u)}
                >
                  <TableCell className="font-medium">
                    @{u.username}
                    {u.is_admin && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">ADMIN</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(u.created_at), "PP")}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtCredits(u.credits)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtCredits(u.net_worth)}</TableCell>
                  <TableCell className={u.email_confirmed ? "text-primary" : "text-muted-foreground"}>
                    {u.email_confirmed ? "Confirmed" : "Unconfirmed"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span>
          Page {page + 1} of {pages} · {total} users
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page + 1 >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selected && <UserDetail user={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDetail({ user }: { user: UserRow }) {
  const [sending, setSending] = useState(false);
  const runReset = useServerFn(sendPasswordReset);
  const qc = useQueryClient();

  const { data: overview } = useQuery({
    queryKey: ["admin-user-overview", user.id],
    queryFn: async () => {
      const { data, error } = await rpc("admin_user_overview", { _user_id: user.id });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: trades } = useQuery({
    queryKey: ["admin-user-trades", user.id],
    queryFn: async () => {
      const { data, error } = await rpc("admin_user_trades", { _user_id: user.id, _limit: 200 });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["admin-user-positions", user.id],
    queryFn: async () => {
      const { data, error } = await rpc("admin_user_positions", { _user_id: user.id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const onReset = async () => {
    setSending(true);
    try {
      await runReset({
        data: { userId: user.id, redirectTo: `${window.location.origin}/reset-password` },
      });
      toast.success(`Password reset email sent to @${user.username}`);
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reset email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <DialogHeader>
        <DialogTitle>@{user.username}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-5">
        <Stat label="Credits" value={fmtCredits(user.credits)} />
        <Stat label="Net worth" value={fmtCredits(user.net_worth)} />
        <Stat label="Joined" value={format(new Date(user.created_at), "PP")} />
        <Stat label="Email" value={user.email_confirmed ? "Confirmed" : "Unconfirmed"} />
      </div>

      <Button size="sm" variant="outline" className="gap-2 mb-6" onClick={onReset} disabled={sending}>
        {sending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
        Send password reset email
      </Button>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="Invites sent" value={String(overview.invites_sent ?? 0)} />
          <Stat label="Invites confirmed" value={String(overview.invites_credited ?? 0)} />
          <Stat label="Referral credits" value={fmtCredits(overview.referral_credits ?? 0)} />
          <Stat
            label="Group bets"
            value={`${overview.group_bets_created ?? 0} created · ${overview.group_bets_joined ?? 0} joined`}
          />
        </div>
      )}

      <Section title={`Positions (${positions?.length ?? 0})`}>
        {(positions ?? []).length === 0 ? (
          <Empty>No positions.</Empty>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {positions!.map((p) => (
              <li key={p.market_id} className="py-2 flex gap-3">
                <span className="flex-1 truncate">{p.market_title}</span>
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {Number(p.yes_shares)} YES · {Number(p.no_shares)} NO · spent {fmtCredits(p.credits_spent)} ·{" "}
                  {p.market_status}
                  {p.resolution ? ` (${p.resolution})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Trades (${trades?.length ?? 0})`}>
        {(trades ?? []).length === 0 ? (
          <Empty>No trades.</Empty>
        ) : (
          <ul className="divide-y divide-border text-sm max-h-72 overflow-y-auto">
            {trades!.map((t) => (
              <li key={t.id} className="py-2 flex gap-3">
                <span className="flex-1 truncate">{t.market_title}</span>
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {t.action} {Number(t.shares)} {String(t.side).toUpperCase()} @ {Number(t.price)} ·{" "}
                  {fmtCredits(t.credits)}c · {format(new Date(t.created_at), "PP")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Group bets (${overview?.group_bets?.length ?? 0})`}>
        {!overview?.group_bets?.length ? (
          <Empty>None.</Empty>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {overview.group_bets.map((b: any) => (
              <li key={`${b.id}-${b.role}`} className="py-2 flex gap-3">
                <span className="flex-1 truncate">{b.title}</span>
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {b.role} · {b.status}
                  {b.wagered ? ` · ${fmtCredits(b.wagered)}c` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-display text-sm font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

/* ---------------------------------- Markets --------------------------------- */

function MarketsTab() {
  const qc = useQueryClient();
  const runSync = useServerFn(syncPolymarketNow);
  const runGenerateNow = useServerFn(generateAiMarketsNow);
  const [syncing, setSyncing] = useState(false);
  const [genAi, setGenAi] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [pruning, setPruning] = useState(false);

  const { data: prunable, isLoading } = useQuery({
    queryKey: ["admin-prunable"],
    queryFn: async () => {
      const { data, error } = await rpc("admin_prunable_markets");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; created_at: string; closes_at: string }>;
    },
  });

  const list = prunable ?? [];
  const pickedIds = list.filter((m) => picked[m.id]).map((m) => m.id);
  const allPicked = list.length > 0 && pickedIds.length === list.length;

  const onSync = async () => {
    setSyncing(true);
    try {
      const body: any = await runSync();
      toast.success(`Synced: ${body.inserted} added, ${body.refreshed ?? 0} refreshed, ${body.closed} closed`);
      qc.invalidateQueries({ queryKey: ["admin-prunable"] });
      qc.invalidateQueries({ queryKey: ["markets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const onGenerateAi = async () => {
    setGenAi(true);
    try {
      const body: any = await runGenerateNow();
      toast.success(`Created ${body.inserted} new AI market${body.inserted === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["markets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setGenAi(false);
    }
  };

  const onPrune = async () => {
    setPruning(true);
    const { data, error } = await rpc("admin_prune_markets", { _ids: pickedIds });
    setPruning(false);
    if (error) return toast.error(error.message);
    const res = data as { deleted: number; skipped: number };
    toast.success(
      `Deleted ${res.deleted} market${res.deleted === 1 ? "" : "s"}${res.skipped ? `, skipped ${res.skipped} with activity` : ""}`,
    );
    setPicked({});
    qc.invalidateQueries({ queryKey: ["admin-prunable"] });
    qc.invalidateQueries({ queryKey: ["markets"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Market ingestion</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={onSync} disabled={syncing}>
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync Polymarket now
          </Button>
          <Button variant="outline" className="gap-2" onClick={onGenerateAi} disabled={genAi}>
            {genAi ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
            {genAi ? "Generating…" : "Generate AI markets"}
          </Button>
        </div>
      </section>

      <NeedsResolutionSection />

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Prune inactive imports</h2>
            <p className="text-xs text-muted-foreground">
              Open Polymarket imports with zero trades and zero volume, oldest first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={list.length === 0}
              onClick={() =>
                setPicked(allPicked ? {} : Object.fromEntries(list.map((m) => [m.id, true])))
              }
            >
              {allPicked ? "Clear all" : "Select all"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-no"
              disabled={pickedIds.length === 0 || pruning}
              onClick={onPrune}
            >
              {pruning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete {pickedIds.length} selected
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="h-32 rounded-lg border border-border bg-card animate-pulse" />
        ) : list.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 rounded-lg border border-dashed border-border text-sm">
            Nothing to prune — every imported market has activity.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-[28rem] overflow-y-auto">
            {list.map((m) => (
              <label key={m.id} className="flex items-start gap-3 p-3 cursor-pointer">
                <Checkbox
                  checked={!!picked[m.id]}
                  onCheckedChange={(v) => setPicked((p) => ({ ...p, [m.id]: !!v }))}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm line-clamp-2">{m.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    Imported {format(new Date(m.created_at), "PP")} · closes{" "}
                    {format(new Date(m.closes_at), "PP")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface PendingMarket {
  id: string;
  title: string;
  closes_at: string;
  created_via: string;
  volume: number;
  waiting_hours: number;
  needs_manual_resolution: boolean;
  proposed_resolution: string | null;
  resolution_reason: string | null;
  auto_resolution_deadline: string | null;
  holders: number;
}

function NeedsResolutionSection() {
  const qc = useQueryClient();
  const runResolveAi = useServerFn(resolveAiMarketsNow);
  const [checking, setChecking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-needs-resolution"],
    queryFn: async () => {
      const { data, error } = await rpc("admin_markets_needing_resolution");
      if (error) throw error;
      return (data ?? []) as PendingMarket[];
    },
  });

  const onCheckNow = async () => {
    setChecking(true);
    try {
      const body: any = await runResolveAi();
      toast.success(
        `Checked ${body.checked}: ${body.proposed} proposed, ${body.inconclusive} need manual review`,
      );
      qc.invalidateQueries({ queryKey: ["admin-needs-resolution"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Outcome check failed");
    } finally {
      setChecking(false);
    }
  };

  const resolveNow = async (m: PendingMarket, resolution: "yes" | "no" | "invalid") => {
    if (!window.confirm(`Resolve "${m.title}" as ${resolution.toUpperCase()}? This pays out holders.`))
      return;
    const { error } = await rpc("resolve_market", { _market_id: m.id, _resolution: resolution });
    if (error) return toast.error(error.message);
    toast.success("Market resolved");
    qc.invalidateQueries({ queryKey: ["admin-needs-resolution"] });
    qc.invalidateQueries({ queryKey: ["markets"] });
  };

  const list = data ?? [];

  return (
    <section>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Gavel size={16} className="text-primary" />
            Needs resolution ({list.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Closed markets with no outcome yet, longest wait first.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={onCheckNow} disabled={checking}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Run outcome check
        </Button>
      </div>

      {isLoading ? (
        <div className="h-28 rounded-lg border border-border bg-card animate-pulse" />
      ) : list.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 rounded-lg border border-dashed border-border text-sm">
          Nothing waiting — every closed market has an outcome.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-[30rem] overflow-y-auto">
          {list.map((m) => (
            <div key={m.id} className="p-3">
              <div className="text-sm line-clamp-2">{m.title}</div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                <span>Waiting {Math.round(Number(m.waiting_hours))}h</span>
                <span>{Number(m.holders)} holder{Number(m.holders) === 1 ? "" : "s"}</span>
                <span>{m.created_via}</span>
                {m.proposed_resolution && (
                  <span className="text-primary">
                    AI proposes {m.proposed_resolution.toUpperCase()}
                    {m.auto_resolution_deadline
                      ? ` · pays ${formatDistanceToNow(new Date(m.auto_resolution_deadline), { addSuffix: true })}`
                      : ""}
                  </span>
                )}
                {m.needs_manual_resolution && <span className="text-no">Flagged / inconclusive</span>}
              </div>
              {m.resolution_reason && (
                <p className="text-xs text-muted-foreground/80 italic mt-1">{m.resolution_reason}</p>
              )}
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => resolveNow(m, "yes")}>
                  Resolve YES
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolveNow(m, "no")}>
                  Resolve NO
                </Button>
                <Button size="sm" variant="ghost" onClick={() => resolveNow(m, "invalid")}>
                  Invalid (refund)
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------------- Activity --------------------------------- */

const RANGES = [7, 30, 90];

function ActivityTab() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity", days],
    queryFn: async () => {
      const { data, error } = await rpc("admin_activity_series", { _days: days });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        day: format(new Date(r.day), "MMM d"),
        signups: Number(r.signups),
        trades: Number(r.trades),
        trade_volume: Number(r.trade_volume),
        group_bets: Number(r.group_bets),
        referral_credits: Number(r.referral_credits),
      }));
    },
  });

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {RANGES.map((d) => (
          <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} days
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Chart title="Daily signups" data={data ?? []} keys={[{ k: "signups", label: "Signups" }]} />
          <Chart
            title="Daily trades"
            data={data ?? []}
            keys={[
              { k: "trades", label: "Trades" },
              { k: "trade_volume", label: "Volume" },
            ]}
          />
          <Chart title="Group bets created" data={data ?? []} keys={[{ k: "group_bets", label: "Bets" }]} />
          <Chart
            title="Referral credits granted"
            data={data ?? []}
            keys={[{ k: "referral_credits", label: "Credits" }]}
          />
        </div>
      )}
    </div>
  );
}

function Chart({
  title,
  data,
  keys,
}: {
  title: string;
  data: any[];
  keys: { k: string; label: string }[];
}) {
  // Theme tokens are raw oklch() colors — wrapping them in hsl() yields an
  // invalid color and recharts renders the stroke as nothing.
  const colors = ["var(--primary)", "var(--muted-foreground)"];
  const hasActivity = data.some((row) => keys.some((k) => Number(row[k.k]) > 0));
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-display text-sm font-semibold mb-3">{title}</h3>
      <div className="h-48">
        {!hasActivity ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No activity in this period.
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" minTickGap={24} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" allowDecimals={false} />
            {keys.length > 1 && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                allowDecimals={false}
              />
            )}
            <RTooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {keys.length > 1 && (
              <Legend
                iconSize={8}
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
              />
            )}
            {keys.map((k, i) => (
              <Line
                key={k.k}
                yAxisId={i === 0 ? "left" : "right"}
                type="monotone"
                dataKey={k.k}
                name={k.label}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                // Dots matter here: a series with a single non-zero day draws
                // no line segment, so without them the chart looks empty.
                dot={{ r: 2, fill: colors[i % colors.length], strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Audit log -------------------------------- */

const ACTION_LABEL: Record<string, string> = {
  grant_admin: "Granted admin",
  revoke_admin: "Revoked admin",
  password_reset_sent: "Sent password reset",
  markets_pruned: "Pruned markets",
  bulk_grant_admin: "Bulk granted admin",
};

function AuditTab() {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: async () => {
      const { data, error } = await rpc("admin_audit_list", { _limit: 200 });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (isLoading) return <div className="h-40 rounded-lg border border-border bg-card animate-pulse" />;
  if (!data?.length)
    return (
      <div className="text-center text-muted-foreground py-12 rounded-lg border border-dashed border-border text-sm">
        No admin actions recorded yet.
      </div>
    );

  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {data.map((e) => {
        const isOpen = !!open[e.id];
        return (
          <div key={e.id}>
            <button
              type="button"
              onClick={() => setOpen((p) => ({ ...p, [e.id]: !isOpen }))}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/40"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-sm flex-1 min-w-0 truncate">
                <span className="font-medium">
                  {e.admin_username ? `@${e.admin_username}` : "System (migration)"}
                </span>{" "}
                <span className="text-muted-foreground">
                  {ACTION_LABEL[e.action] ?? e.action}
                </span>
                {e.target_username && <span> · @{e.target_username}</span>}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
              </span>
            </button>
            {isOpen && (
              <pre className="px-10 pb-3 text-xs text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(e.details, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- AI Suggestions ------------------------------ */

interface Suggestion {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  suggested_closes_at: string;
  source_summary: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

function SuggestionsTab() {
  const qc = useQueryClient();
  const [discovering, setDiscovering] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Suggestion>>({});
  const runDiscoverNow = useServerFn(discoverTrendingNow);
  const runApprove = useServerFn(approveSuggestionChecked);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["market-suggestions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("market_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });

  const catName = (id: string | null) =>
    categories?.find((c) => c.id === id)?.name ?? "Uncategorized";

  const onDiscover = async () => {
    setDiscovering(true);
    try {
      const body: any = await runDiscoverNow();
      toast.success(`Discovered ${body.inserted} new suggestions`);
      qc.invalidateQueries({ queryKey: ["market-suggestions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  };

  const startEdit = (s: Suggestion) => {
    setEditing(s.id);
    setDraft({ ...s });
  };

  const onApprove = async (s: Suggestion) => {
    const payload =
      editing === s.id
        ? {
            suggestionId: s.id,
            title: draft.title ?? s.title,
            description: draft.description ?? s.description ?? "",
            categoryId: draft.category_id ?? s.category_id,
            closesAt: draft.suggested_closes_at ?? s.suggested_closes_at,
          }
        : { suggestionId: s.id };
    setApproving(s.id);
    try {
      const res: any = await runApprove({ data: payload });
      if (!res.approved) {
        toast.error(res.reason, { duration: 10000 });
        return;
      }
      toast.success("Market created");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["market-suggestions"] });
      qc.invalidateQueries({ queryKey: ["markets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setApproving(null);
    }
  };

  const onReject = async (s: Suggestion) => {
    const { error } = await rpc("reject_market_suggestion", { _suggestion_id: s.id });
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["market-suggestions"] });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Review trending market ideas surfaced by AI. Approve to publish.
        </p>
        <Button onClick={onDiscover} disabled={discovering} variant="outline" size="sm" className="gap-2">
          {discovering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {discovering ? "Discovering…" : "Discover now"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : suggestions && suggestions.length > 0 ? (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const isEditing = editing === s.id;
            const d = isEditing ? draft : s;
            return (
              <div key={s.id} className="rounded-lg border border-border bg-card p-5">
                {isEditing ? (
                  <div className="space-y-3">
                    <Input
                      value={d.title ?? ""}
                      onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                    />
                    <Textarea
                      rows={3}
                      value={d.description ?? ""}
                      onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                    />
                    <div className="flex gap-3 flex-wrap">
                      <select
                        value={d.category_id ?? ""}
                        onChange={(e) => setDraft((p) => ({ ...p, category_id: e.target.value || null }))}
                        className="bg-background border border-input rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">Uncategorized</option>
                        {categories?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="datetime-local"
                        className="w-auto"
                        value={
                          d.suggested_closes_at
                            ? new Date(d.suggested_closes_at).toISOString().slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            suggested_closes_at: new Date(e.target.value).toISOString(),
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-display font-semibold text-base mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{s.description}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <span className="px-2 py-0.5 rounded bg-secondary text-foreground/70">
                        {catName(s.category_id)}
                      </span>
                      <span>Closes {format(new Date(s.suggested_closes_at), "PP")}</span>
                    </div>
                    {s.source_summary && (
                      <p className="text-xs text-muted-foreground/80 italic">{s.source_summary}</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-4 flex-wrap">
                  <Button size="sm" onClick={() => onApprove(s)} disabled={approving === s.id} className="gap-1.5">
                    {approving === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {approving === s.id ? "Checking…" : "Approve"}
                  </Button>
                  {!isEditing && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(s)} className="gap-1.5">
                      <Pencil size={14} /> Edit
                    </Button>
                  )}
                  {isEditing && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel edit
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onReject(s)} className="gap-1.5 text-no">
                    <X size={14} /> Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-12 rounded-lg border border-dashed border-border text-sm">
          No pending suggestions. Click <span className="font-mono">Discover now</span> to fetch new ones.
        </div>
      )}
    </div>
  );
}
