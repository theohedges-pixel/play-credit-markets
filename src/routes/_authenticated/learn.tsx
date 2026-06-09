import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Coins, CheckCircle2, PlayCircle, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/learn")({
  head: () => ({ meta: [{ title: "Learn & earn — Predikt" }] }),
  component: LearnPage,
});

interface Module {
  id: string;
  kind: "video" | "quiz";
  title: string;
  description: string;
  video_url: string | null;
  min_watch_seconds: number;
  questions: { q: string; options: string[]; answer: number }[] | null;
  pass_threshold: number;
  reward: number;
  sort_order: number;
}

function LearnPage() {
  const { user, refreshProfile } = useAuth();

  const modulesQ = useQuery({
    queryKey: ["learning_modules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_modules")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as Module[];
    },
  });

  const completionsQ = useQuery({
    queryKey: ["learning_completions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_completions")
        .select("module_id, credits_awarded, completed_at");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const completedIds = new Set(completionsQ.data?.map((c) => c.module_id) ?? []);

  return (
    <div>
      <Header />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Learn & earn</h1>
          <p className="text-muted-foreground">
            Watch short videos and take quick quizzes on how to keep play healthy. Earn bonus credits for each one — one claim per module.
          </p>
        </div>

        {modulesQ.isLoading && <div className="text-muted-foreground">Loading…</div>}

        <div className="grid gap-4">
          {modulesQ.data?.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              completed={completedIds.has(m.id)}
              onClaimed={async () => {
                await refreshProfile();
                await completionsQ.refetch();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({
  module,
  completed,
  onClaimed,
}: {
  module: Module;
  completed: boolean;
  onClaimed: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground">
              {module.kind === "video" ? <PlayCircle size={14} /> : <ListChecks size={14} />}
              {module.kind}
            </div>
            <CardTitle>{module.title}</CardTitle>
            <CardDescription className="mt-1">{module.description}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1 text-primary font-mono text-sm">
              <Coins size={14} />+{module.reward}
            </div>
            {completed ? (
              <span className="flex items-center gap-1 text-xs text-primary">
                <CheckCircle2 size={14} /> Claimed
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
                {open ? "Close" : module.kind === "video" ? "Watch" : "Start quiz"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {open && !completed && (
        <CardContent>
          {module.kind === "video" ? (
            <VideoBlock module={module} onClaimed={onClaimed} />
          ) : (
            <QuizBlock module={module} onClaimed={onClaimed} />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function VideoBlock({ module, onClaimed }: { module: Module; onClaimed: () => Promise<void> }) {
  const [elapsed, setElapsed] = useState(0);
  const [claiming, setClaiming] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ready = elapsed >= module.min_watch_seconds;

  const claim = async () => {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_learning_reward", {
      _module_id: module.id,
      _score: null as unknown as number,
    });
    setClaiming(false);
    if (error) { toast.error(error.message); return; }
    const award = (data as any)?.[0]?.credits_awarded ?? module.reward;
    toast.success(`+${award} credits added`);
    await onClaimed();
  };

  return (
    <div className="space-y-4">
      {module.video_url && (
        <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
          <iframe
            src={module.video_url}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={module.title}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {ready
            ? "You've watched enough — claim your credits."
            : `Watch for ${module.min_watch_seconds - elapsed}s more to unlock the reward.`}
        </div>
        <Button onClick={claim} disabled={!ready || claiming}>
          {claiming ? "Claiming…" : `Claim +${module.reward}`}
        </Button>
      </div>
    </div>
  );
}

function QuizBlock({ module, onClaimed }: { module: Module; onClaimed: () => Promise<void> }) {
  const questions = useMemo(() => module.questions ?? [], [module]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState<{ score: number } | null>(null);
  const [claiming, setClaiming] = useState(false);

  const submit = () => {
    const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.answer ? 1 : 0), 0);
    setSubmitted({ score });
  };

  const claim = async () => {
    if (!submitted) return;
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_learning_reward", {
      _module_id: module.id,
      _score: submitted.score,
    });
    setClaiming(false);
    if (error) { toast.error(error.message); return; }
    const award = (data as any)?.[0]?.credits_awarded ?? module.reward;
    toast.success(`+${award} credits added`);
    await onClaimed();
  };

  const passed = submitted && submitted.score >= module.pass_threshold;

  return (
    <div className="space-y-5">
      {questions.map((q, i) => (
        <div key={i} className="space-y-2">
          <div className="font-medium text-sm">{i + 1}. {q.q}</div>
          <div className="grid gap-1.5">
            {q.options.map((opt, j) => {
              const selected = answers[i] === j;
              const correct = submitted && j === q.answer;
              const wrong = submitted && selected && j !== q.answer;
              return (
                <button
                  key={j}
                  type="button"
                  disabled={!!submitted}
                  onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                  className={`text-left text-sm rounded-md border px-3 py-2 transition-colors ${
                    correct
                      ? "border-primary bg-primary/10"
                      : wrong
                        ? "border-destructive bg-destructive/10"
                        : selected
                          ? "border-foreground"
                          : "border-border hover:border-foreground/40"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {!submitted ? (
        <Button
          onClick={submit}
          disabled={Object.keys(answers).length < questions.length}
        >
          Submit answers
        </Button>
      ) : (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="text-sm">
            Score: <span className="font-mono">{submitted.score} / {questions.length}</span>
            {" · "}
            {passed ? (
              <span className="text-primary">Passed (need {module.pass_threshold})</span>
            ) : (
              <span className="text-destructive">Need {module.pass_threshold} to pass</span>
            )}
          </div>
          <Button onClick={claim} disabled={!passed || claiming}>
            {claiming ? "Claiming…" : `Claim +${module.reward}`}
          </Button>
        </div>
      )}
    </div>
  );
}
