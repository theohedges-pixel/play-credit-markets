import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArticleBody } from "@/components/ArticleBody";
import { LEVEL_REWARD, type LearnLevel } from "@/lib/learn";
import { cn } from "@/lib/utils";

interface AdminArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  part: number;
  part_name: string;
  level: LearnLevel;
  reward: number;
  sort_order: number;
  read_minutes: number;
  status: "published" | "draft";
  questions_a: number;
  questions_b: number;
  passes: number;
}

interface QuestionRow {
  id?: string;
  article_id?: string;
  question_set: "A" | "B";
  sort_order: number;
  prompt: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  explanation: string;
}

const blankArticle = () => ({
  slug: "",
  title: "",
  summary: "",
  body: "",
  part: 1,
  part_name: "",
  level: "basic" as LearnLevel,
  reward: 10,
  sort_order: 0,
  read_minutes: 5,
  status: "draft" as const,
});

const audit = (action: string, articleId: string | null, details: Record<string, unknown>) =>
  (supabase as any).rpc("admin_log_learn_action", {
    _action: action,
    _article_id: articleId,
    _details: details,
  });

export function LearnContentTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const listQ = useQuery({
    queryKey: ["admin-learn-articles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_learn_articles");
      if (error) throw error;
      return (data ?? []) as AdminArticle[];
    },
  });

  const articles = listQ.data ?? [];

  const setStatus = async (a: AdminArticle, status: "published" | "draft") => {
    const { error } = await (supabase as any)
      .from("learn_articles")
      .update({ status })
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await audit(status === "published" ? "article_published" : "article_unpublished", a.id, {
      title: a.title,
    });
    toast.success(status === "published" ? "Published" : "Moved to draft");
    qc.invalidateQueries({ queryKey: ["admin-learn-articles"] });
    qc.invalidateQueries({ queryKey: ["learn-articles"] });
  };

  const remove = async (a: AdminArticle) => {
    if (!confirm(`Delete "${a.title}" and its questions?`)) return;
    const { error } = await (supabase as any).from("learn_articles").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await audit("article_deleted", null, { title: a.title, slug: a.slug });
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-learn-articles"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm text-muted-foreground">
          {articles.length} articles ·{" "}
          {articles.filter((a) => a.status === "published").length} published
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={15} /> New article
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Part</th>
              <th className="text-left px-3 py-2">Level</th>
              <th className="text-left px-3 py-2">Questions</th>
              <th className="text-left px-3 py-2">Passed</th>
              <th className="text-left px-3 py-2">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2">
                  <button className="text-left hover:underline" onClick={() => setEditingId(a.id)}>
                    {a.title}
                  </button>
                  <div className="text-xs text-muted-foreground font-mono">{a.slug}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {a.part} · {a.part_name}
                </td>
                <td className="px-3 py-2">{a.level}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  A {a.questions_a} / B {a.questions_b}
                </td>
                <td className="px-3 py-2 font-mono">{a.passes}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-mono",
                      a.status === "published"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus(a, a.status === "published" ? "draft" : "published")}
                  >
                    {a.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
            {!articles.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {listQ.isLoading ? "Loading…" : "No articles yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editingId) && (
        <ArticleEditor
          articleId={editingId}
          onClose={() => {
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function ArticleEditor({
  articleId,
  onClose,
}: {
  articleId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(blankArticle());
  const [loaded, setLoaded] = useState(!articleId);
  const [preview, setPreview] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [saving, setSaving] = useState(false);

  useQuery({
    queryKey: ["admin-learn-article", articleId],
    enabled: !!articleId,
    queryFn: async () => {
      const [{ data: art }, { data: qs }] = await Promise.all([
        (supabase as any).from("learn_articles").select("*").eq("id", articleId).maybeSingle(),
        (supabase as any)
          .from("learn_questions")
          .select("*")
          .eq("article_id", articleId)
          .order("question_set")
          .order("sort_order"),
      ]);
      if (art) setForm(art);
      setQuestions((qs ?? []) as QuestionRow[]);
      setLoaded(true);
      return art;
    },
  });

  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  const validateSet = (s: "A" | "B") => {
    const rows = questions.filter((q) => q.question_set === s);
    if (rows.length === 0) return null; // an empty set is allowed until it's written
    if (rows.length < 5 || rows.length > 10) return `Set ${s} needs between 5 and 10 questions`;
    for (const [i, q] of rows.entries()) {
      if (!q.prompt.trim()) return `Set ${s} question ${i + 1} has no prompt`;
      if (q.options.length < 2) return `Set ${s} question ${i + 1} needs at least 2 options`;
      if (!q.options.some((o) => o.id === q.correct_option_id))
        return `Set ${s} question ${i + 1} has no correct option marked`;
    }
    return null;
  };

  const save = async () => {
    for (const s of ["A", "B"] as const) {
      const err = validateSet(s);
      if (err) { toast.error(err); return; }
    }
    if (!form.slug.trim() || !form.title.trim()) {
      toast.error("Slug and title are required");
      return;
    }
    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      title: form.title,
      summary: form.summary,
      body: form.body,
      part: Number(form.part),
      part_name: form.part_name,
      level: form.level,
      reward: Number(form.reward) || LEVEL_REWARD[form.level as LearnLevel],
      sort_order: Number(form.sort_order),
      read_minutes: Number(form.read_minutes),
      status: form.status,
    };

    let id = articleId;
    if (id) {
      const { error } = await (supabase as any).from("learn_articles").update(payload).eq("id", id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { data, error } = await (supabase as any)
        .from("learn_articles")
        .insert(payload)
        .select("id")
        .single();
      if (error) { setSaving(false); toast.error(error.message); return; }
      id = data.id;
    }

    await (supabase as any).from("learn_questions").delete().eq("article_id", id);
    const rows = questions
      .filter((q) => q.prompt.trim())
      .map((q, i) => ({
        article_id: id,
        question_set: q.question_set,
        sort_order: q.sort_order ?? i,
        prompt: q.prompt,
        options: q.options,
        correct_option_id: q.correct_option_id,
        explanation: q.explanation ?? "",
      }));
    if (rows.length) {
      const { error } = await (supabase as any).from("learn_questions").insert(rows);
      if (error) { setSaving(false); toast.error(error.message); return; }
    }

    await audit(articleId ? "article_updated" : "article_created", id, {
      title: payload.title,
      status: payload.status,
      questions: rows.length,
    });

    setSaving(false);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["admin-learn-articles"] });
    qc.invalidateQueries({ queryKey: ["learn-articles"] });
    onClose();
  };

  const addQuestion = (s: "A" | "B") =>
    setQuestions((qs) => [
      ...qs,
      {
        question_set: s,
        sort_order: qs.filter((q) => q.question_set === s).length,
        prompt: "",
        options: [
          { id: "a", text: "" },
          { id: "b", text: "" },
        ],
        correct_option_id: "a",
        explanation: "",
      },
    ]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{articleId ? "Edit article" : "New article"}</DialogTitle>
        </DialogHeader>

        {!loaded ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Title">
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
              </Field>
              <Field label="Slug">
                <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} />
              </Field>
              <Field label="Part number">
                <Input
                  type="number"
                  value={form.part}
                  onChange={(e) => set("part", e.target.value)}
                />
              </Field>
              <Field label="Part name">
                <Input value={form.part_name} onChange={(e) => set("part_name", e.target.value)} />
              </Field>
              <Field label="Level">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={form.level}
                  onChange={(e) => {
                    set("level", e.target.value);
                    set("reward", LEVEL_REWARD[e.target.value as LearnLevel]);
                  }}
                >
                  <option value="basic">basic</option>
                  <option value="intermediate">intermediate</option>
                  <option value="advanced">advanced</option>
                </select>
              </Field>
              <Field label="Reward">
                <Input
                  type="number"
                  value={form.reward}
                  onChange={(e) => set("reward", e.target.value)}
                />
              </Field>
              <Field label="Sort order in part">
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => set("sort_order", e.target.value)}
                />
              </Field>
              <Field label="Read minutes">
                <Input
                  type="number"
                  value={form.read_minutes}
                  onChange={(e) => set("read_minutes", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Summary">
              <Input value={form.summary} onChange={(e) => set("summary", e.target.value)} />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Body (markdown)
                </label>
                <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
                  <Eye size={14} /> {preview ? "Edit" : "Preview"}
                </Button>
              </div>
              {preview ? (
                <div className="rounded-md border border-border bg-card p-4 max-h-[420px] overflow-y-auto">
                  <ArticleBody body={form.body ?? ""} />
                </div>
              ) : (
                <Textarea
                  value={form.body ?? ""}
                  onChange={(e) => set("body", e.target.value)}
                  className="min-h-[320px] font-mono text-sm"
                />
              )}
            </div>

            {(["A", "B"] as const).map((s) => (
              <div key={s} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-sm">
                    Question set {s}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({questions.filter((q) => q.question_set === s).length} — needs 5 to 10)
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addQuestion(s)}>
                    <Plus size={14} /> Question
                  </Button>
                </div>
                <div className="space-y-4">
                  {questions.map((q, gi) =>
                    q.question_set !== s ? null : (
                      <QuestionEditor
                        key={gi}
                        q={q}
                        onChange={(nq) =>
                          setQuestions((qs) => qs.map((x, i) => (i === gi ? nq : x)))
                        }
                        onRemove={() => setQuestions((qs) => qs.filter((_, i) => i !== gi))}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.status === "published"}
                  onChange={(e) => set("status", e.target.checked ? "published" : "draft")}
                />
                Published
              </label>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save article"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestionEditor({
  q,
  onChange,
  onRemove,
}: {
  q: QuestionRow;
  onChange: (q: QuestionRow) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-border/70 p-3 space-y-2">
      <div className="flex gap-2">
        <Input
          value={q.prompt}
          placeholder="Question prompt"
          onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        />
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <X size={14} />
        </Button>
      </div>
      <div className="space-y-1.5">
        {q.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              checked={q.correct_option_id === o.id}
              onChange={() => onChange({ ...q, correct_option_id: o.id })}
              title="Correct answer"
            />
            <Input
              value={o.text}
              placeholder={`Option ${o.id}`}
              onChange={(e) =>
                onChange({
                  ...q,
                  options: q.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({ ...q, options: q.options.filter((_, j) => j !== i) })
              }
            >
              <X size={13} />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange({
              ...q,
              options: [
                ...q.options,
                { id: String.fromCharCode(97 + q.options.length), text: "" },
              ],
            })
          }
        >
          <Plus size={13} /> Option
        </Button>
      </div>
      <Input
        value={q.explanation ?? ""}
        placeholder="Explanation shown after answering"
        onChange={(e) => onChange({ ...q, explanation: e.target.value })}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-muted-foreground block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
