import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fireCelebration } from "@/components/MilestoneCelebration";
import { cn } from "@/lib/utils";

interface Option { id: string; text: string }
interface Question { id: string; prompt: string; options: Option[] }

interface ReviewRow {
  question_id: string;
  prompt: string;
  options: Option[];
  selected_option_id: string | null;
  correct_option_id: string;
  correct: boolean;
  explanation: string;
}

interface Result {
  score: number;
  total: number;
  passed: boolean;
  attempt_number: number;
  attempts_remaining: number;
  credits_awarded: number;
  achievements: { key: string; name: string; credits: number }[];
  review: ReviewRow[];
}

export function LearnQuiz({
  articleId,
  reward,
  onDone,
}: {
  articleId: string;
  reward: number;
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("start_learn_attempt" as any, {
        _article_id: articleId,
      });
      if (cancelled) return;
      if (error) { setError(error.message); return; }
      const d = data as any;
      setQuestions(d.questions as Question[]);
      setAttemptNumber(d.attempt_number);
    })();
    return () => { cancelled = true; };
  }, [articleId]);

  const submit = async () => {
    if (!questions) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_learn_attempt" as any, {
      _article_id: articleId,
      _answers: questions.map((q) => ({
        question_id: q.id,
        selected_option_id: answers[q.id] ?? null,
      })),
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    const r = data as unknown as Result;
    setResult(r);
    onDone();
    if (r.passed) {
      fireCelebration();
      toast.success(
        r.credits_awarded > 0
          ? `Passed — +${r.credits_awarded} credits`
          : "Passed!",
      );
    }
    if (r.achievements?.length) {
      r.achievements.forEach((a) =>
        toast.custom(
          () => (
            <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-card px-4 py-3 shadow-lg">
              <span className="rounded-full border border-primary/40 bg-primary/10 p-2 text-primary">
                <Trophy size={18} />
              </span>
              <div>
                <div className="font-display text-sm font-bold">{a.name} unlocked</div>
                <div className="text-xs text-muted-foreground font-mono">
                  Learning badge earned — +{a.credits} credits
                </div>
              </div>
            </div>
          ),
          { duration: 8000 },
        ),
      );
    }
  };

  if (error) {
    return <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">{error}</div>;
  }

  if (result) return <Results result={result} reward={reward} />;

  if (!questions) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Loading the quiz…
      </div>
    );
  }

  const q = questions[idx];
  const chosen = answers[q.id];
  const last = idx === questions.length - 1;
  const allAnswered = questions.every((x) => answers[x.id]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground mb-4">
        <span>Question {idx + 1} of {questions.length}</span>
        <span>Attempt {attemptNumber} of 2</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-6">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="font-medium mb-4 leading-relaxed">{q.prompt}</div>
      <div className="grid gap-2">
        {q.options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
            className={cn(
              "text-left text-sm rounded-md border px-3.5 py-3 transition-colors leading-snug",
              chosen === o.id
                ? "border-primary bg-primary/10"
                : "border-border hover:border-foreground/40",
            )}
          >
            {o.text}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mt-6">
        <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
          Back
        </Button>
        {last ? (
          <Button onClick={submit} disabled={!allAnswered || submitting}>
            {submitting ? "Grading…" : "Submit answers"}
          </Button>
        ) : (
          <Button onClick={() => setIdx((i) => i + 1)} disabled={!chosen}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function Results({ result, reward }: { result: Result; reward: number }) {
  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-lg border p-5",
          result.passed ? "border-primary/50 bg-primary/5" : "border-destructive/50 bg-destructive/5",
        )}
      >
        <div className="font-display text-2xl font-bold mb-1">
          {result.passed ? "Passed" : "Not quite"}
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          {result.score} / {result.total} correct
          {result.credits_awarded > 0 && ` · +${result.credits_awarded} credits`}
        </div>
        <p className="text-sm mt-3 leading-relaxed">
          {result.passed
            ? result.credits_awarded > 0
              ? `Nice work — ${reward} credits have been added to your balance.`
              : "You'd already earned the credits for this one, so no extra this time."
            : result.attempts_remaining > 0
              ? "You have one more attempt on this article, and it will use a different set of questions. Re-read the article, then try again whenever you're ready."
              : "That was your second and final attempt, so no more are available. The article stays here to read any time."}
        </p>
      </div>

      <div className="space-y-4">
        {result.review.map((r, i) => {
          const selected = r.options.find((o) => o.id === r.selected_option_id);
          const correct = r.options.find((o) => o.id === r.correct_option_id);
          return (
            <div key={r.question_id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-2 mb-2">
                {r.correct ? (
                  <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={18} className="text-destructive shrink-0 mt-0.5" />
                )}
                <div className="font-medium text-sm leading-snug">{i + 1}. {r.prompt}</div>
              </div>
              <div className="text-sm space-y-1 pl-6">
                <div className={r.correct ? "text-primary" : "text-destructive"}>
                  Your answer: {selected?.text ?? "— not answered"}
                </div>
                {!r.correct && <div className="text-primary">Correct: {correct?.text}</div>}
                {r.explanation && (
                  <p className="text-muted-foreground leading-relaxed pt-1">{r.explanation}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
