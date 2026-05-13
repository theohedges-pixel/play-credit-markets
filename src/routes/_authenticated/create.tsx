import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({ meta: [{ title: "Create market — Predikt" }] }),
  component: CreateMarket,
});

function CreateMarket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [closesAt, setClosesAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (title.length < 8) { toast.error("Title is too short"); return; }
    if (!closesAt) { toast.error("Pick a close date"); return; }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("markets")
      .insert({
        creator_id: user.id,
        title,
        description: description || null,
        category_id: categoryId || null,
        closes_at: new Date(closesAt).toISOString(),
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Market created");
    navigate({ to: "/markets/$id", params: { id: data.id } });
  };

  // default close date: 7 days from now
  const minDate = new Date();
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Create a market</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Ask a yes/no question others can trade on. As the creator, you'll resolve it after the close date.
        </p>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <Label>Question</Label>
            <Input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Will Bitcoin close above $100k by Jan 1?"
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resolution criteria, sources, and details…"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Closes at</Label>
              <Input
                type="datetime-local"
                required
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                min={minDate.toISOString().slice(0, 16)}
              />
            </div>
          </div>
          <Button type="submit" disabled={submitting} size="lg">
            {submitting ? "Creating…" : "Launch market"}
          </Button>
        </form>
      </div>
    </div>
  );
}
