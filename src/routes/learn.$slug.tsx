import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { ArticleBody } from "@/components/ArticleBody";
import { LearnQuiz } from "@/components/LearnQuiz";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LEVEL_STYLE, articleState, type LearnArticle, type LearnAttempt } from "@/lib/learn";

export const Route = createFileRoute("/learn/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("learn_articles" as any)
      .select("id, slug, title, summary, body, part, part_name, level, reward, sort_order, read_minutes, status")
      .eq("slug", params.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { article: (data as unknown) as LearnArticle };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Not found — Predikt" }, { name: "robots", content: "noindex" }] };
    }
    const a = loaderData.article;
    return {
      meta: [
        { title: `${a.title} — Predikt Learn` },
        { name: "description", content: a.summary },
        { property: "og:title", content: `${a.title} — Predikt Learn` },
        { property: "og:description", content: a.summary },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <ArticleMessage title="Something went wrong" />,
  notFoundComponent: () => <ArticleMessage title="Article not found" />,
  component: ArticlePage,
});

function ArticleMessage({ title }: { title: string }) {
  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-5 py-16 text-center">
        <h1 className="font-display text-2xl font-bold mb-3">{title}</h1>
        <Link to="/learn" className="text-primary hover:underline text-sm">
          Back to Learn
        </Link>
      </div>
    </div>
  );
}

function ArticlePage() {
  const { article } = Route.useLoaderData();
  const { user, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [quizOpen, setQuizOpen] = useState(false);

  const attemptsQ = useQuery({
    queryKey: ["learn-attempts", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("learn_attempts" as any)
        .select("article_id, attempt_number, score, total, passed, credits_awarded, created_at");
      return ((data ?? []) as unknown) as LearnAttempt[];
    },
  });

  const st = articleState(article.id, attemptsQ.data ?? []);

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
        <Link
          to="/learn"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft size={15} /> Learn
        </Link>

        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-mono">
          Part {article.part} · {article.part_name}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight mb-3">
          {article.title}
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-4">{article.summary}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pb-6 mb-8 border-b border-border">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 uppercase tracking-wide",
              LEVEL_STYLE[article.level],
            )}
          >
            {article.level}
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Coins size={12} />+{article.reward} credits
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock size={12} />
            {article.read_minutes} min read
          </span>
        </div>

        <ArticleBody body={article.body ?? ""} />

        <div className="mt-12 pt-8 border-t border-border">
          {!user ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <div className="font-semibold mb-1">Take the quiz to earn credits</div>
              <p className="text-muted-foreground mb-4">
                Pass the quiz on this article and {article.reward} credits are added to your
                balance.
              </p>
              <Button asChild>
                <Link to="/signup">Create a free account</Link>
              </Button>
            </div>
          ) : st.passed ? (
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 size={18} /> You've passed this quiz — credits already earned.
            </div>
          ) : st.attemptsLeft === 0 ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <div className="font-semibold mb-1">No attempts remaining</div>
              <p className="text-muted-foreground">
                You've used both attempts on this article. The article stays here to read any
                time.
              </p>
            </div>
          ) : quizOpen ? (
            <LearnQuiz
              articleId={article.id}
              reward={article.reward}
              onDone={async () => {
                await refreshProfile();
                await qc.invalidateQueries({ queryKey: ["learn-attempts", user.id] });
                await qc.invalidateQueries({ queryKey: ["learn-counters", user.id] });
                await qc.invalidateQueries({ queryKey: ["learn-achievements", user.id] });
              }}
            />
          ) : (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="font-semibold mb-1">Ready for the quiz?</div>
              <p className="text-sm text-muted-foreground mb-4">
                {st.attemptsUsed === 0
                  ? "A handful of questions on what you've just read. You need all but one right to pass, and you get two attempts."
                  : "This is your second and final attempt, with a different set of questions."}
              </p>
              <Button onClick={() => setQuizOpen(true)}>Take the quiz</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
