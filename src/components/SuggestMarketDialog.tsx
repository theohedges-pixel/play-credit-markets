import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  submitMarketSuggestion,
  mySuggestions,
  mySuggestedMarkets,
  setMarketAttribution,
} from "@/lib/suggestions.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Lightbulb, Loader2, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";

/**
 * Member-facing entry point for suggesting a market. The form is deliberately
 * one free-text box: the submitter does not have to write a well-formed
 * question, because an admin-reviewed AI step turns it into one.
 */
export function SuggestMarketDialog() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const accountDefault = (profile as any)?.attribute_suggestions_publicly ?? true;
  const [attribute, setAttribute] = useState<boolean>(accountDefault);

  const submit = useServerFn(submitMarketSuggestion);
  const loadMine = useServerFn(mySuggestions);
  const loadMyMarkets = useServerFn(mySuggestedMarkets);
  const setAttribution = useServerFn(setMarketAttribution);

  useEffect(() => {
    if (open) setAttribute(accountDefault);
  }, [open, accountDefault]);


  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: mine } = useQuery({
    queryKey: ["my-suggestions", user?.id],
    enabled: !!user && open,
    queryFn: () => loadMine(),
  });

  const { data: myMarkets } = useQuery({
    queryKey: ["my-suggested-markets", user?.id],
    enabled: !!user && open,
    queryFn: () => loadMyMarkets(),
  });

  const flipAttribution = async (marketId: string, next: boolean) => {
    try {
      await setAttribution({ data: { marketId, isPublic: next } });
      qc.invalidateQueries({ queryKey: ["my-suggested-markets"] });
      qc.invalidateQueries({ queryKey: ["market"] });
      toast.success(next ? "Your username is shown on that market" : "Your username is hidden on that market");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change that");
    }
  };

  if (!user) return null;

  const onSubmit = async () => {
    setSubmitting(true);
    setBlocked(null);
    try {
      const res = await submit({
        data: {
          text: text.trim(),
          categoryId: categoryId || null,
          attributePublicly: attribute,
        },
      });
      if (res.status === "pending") {
        toast.success("Sent for review — you'll be notified either way.");
        setText("");
        setOpen(false);
      } else {
        setBlocked(res.reason);
      }
      qc.invalidateQueries({ queryKey: ["my-suggestions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that suggestion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Lightbulb size={14} /> Suggest a market
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggest a market</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Describe what you want people to bet on. It needs a clear answer that can be checked
          against a public source by a specific date. Don't worry about the wording — we'll turn it
          into a proper question.
        </p>

        <Textarea
          rows={4}
          maxLength={500}
          placeholder="e.g. Will the next Formula 1 season opener be won by a Ferrari driver?"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setBlocked(null);
          }}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-2 text-sm"
          >
            <option value="">Category (optional)</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button onClick={onSubmit} disabled={submitting || text.trim().length < 15} className="gap-2">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Checking…" : "Send for review"}
          </Button>
        </div>

        {blocked && (
          <div className="rounded-md border border-no/50 bg-no/10 p-3 text-sm">
            <p className="font-medium mb-1 flex items-center gap-1.5 text-no">
              <X size={14} /> This one can't be used
            </p>
            <p className="text-muted-foreground">{blocked}</p>
          </div>
        )}

        {mine && mine.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Your suggestions
            </p>
            <ul className="space-y-2">
              {mine.map((s) => (
                <li key={s.id} className="text-sm">
                  <span className="flex items-start gap-2">
                    {s.status === "approved" ? (
                      <Check size={14} className="text-yes mt-0.5 shrink-0" />
                    ) : s.status === "rejected" ? (
                      <X size={14} className="text-no mt-0.5 shrink-0" />
                    ) : (
                      <Clock size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <span>
                      <span className="line-clamp-2">{s.user_text ?? s.title}</span>
                      {s.rejection_reason && (
                        <span className="block text-xs text-muted-foreground">
                          {s.rejection_reason}
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
