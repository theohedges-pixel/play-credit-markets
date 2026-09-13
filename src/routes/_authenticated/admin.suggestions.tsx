import { useServerFn } from "@tanstack/react-start";
import { discoverTrendingNow } from "@/lib/admin-jobs.functions";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Check, X, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/suggestions")({
  head: () => ({ meta: [{ title: "AI Suggestions — Admin" }] }),
  component: AdminSuggestions,
});

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

function AdminSuggestions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [discovering, setDiscovering] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Suggestion>>({});

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

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["market-suggestions"],
    enabled: !!isAdmin,
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

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/markets" />;

  const catName = (id: string | null) =>
    categories?.find((c) => c.id === id)?.name ?? "Uncategorized";

  const runDiscoverNow = useServerFn(discoverTrendingNow);

  const onDiscover = async () => {
    setDiscovering(true);
    try {
      const body = await runDiscoverNow();
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
            _suggestion_id: s.id,
            _title: draft.title ?? s.title,
            _description: draft.description ?? s.description,
            _category_id: draft.category_id ?? s.category_id,
            _closes_at: draft.suggested_closes_at ?? s.suggested_closes_at,
          }
        : { _suggestion_id: s.id };
    const { error } = await (supabase.rpc as any)("approve_market_suggestion", payload);
    if (error) return toast.error(error.message);
    toast.success("Market created");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["market-suggestions"] });
    qc.invalidateQueries({ queryKey: ["markets"] });
  };

  const onReject = async (s: Suggestion) => {
    const { error } = await (supabase.rpc as any)("reject_market_suggestion", {
      _suggestion_id: s.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["market-suggestions"] });
  };

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="text-primary" size={22} />
              <h1 className="font-display text-4xl font-bold">AI Suggestions</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Review trending market ideas surfaced by AI. Approve to publish.
            </p>
          </div>
          <Button onClick={onDiscover} disabled={discovering} variant="outline" className="gap-2">
            {discovering ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
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
                          onChange={(e) =>
                            setDraft((p) => ({ ...p, category_id: e.target.value || null }))
                          }
                          className="bg-background border border-input rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Uncategorized</option>
                          {categories?.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
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
                        <p className="text-xs text-muted-foreground/80 italic">
                          {s.source_summary}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-4 flex-wrap">
                    <Button size="sm" onClick={() => onApprove(s)} className="gap-1.5">
                      <Check size={14} /> Approve
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
          <div className="text-center text-muted-foreground py-12 rounded-lg border border-dashed border-border">
            No pending suggestions. Click <span className="font-mono">Discover now</span> to fetch new ones.
          </div>
        )}
      </div>
    </div>
  );
}
