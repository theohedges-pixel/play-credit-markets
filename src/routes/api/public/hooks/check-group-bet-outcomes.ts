import { verifyCronSecret } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

const REVIEW_WINDOW_HOURS = 24;
const MAX_PER_RUN = 10;

const SYSTEM = `You settle play-money group bets. You are given a yes/no question, its
description, and the creator's note on how the outcome can be verified.

Decide whether the real-world outcome is YES, NO, or INCONCLUSIVE. Answer INCONCLUSIVE
whenever you are not confident, the event is ambiguous, the source is vague, or you do not
have reliable knowledge of the result. Never guess.

Return STRICT JSON ONLY (no prose, no markdown fences):
{ "outcome": "yes" | "no" | "inconclusive", "reasoning": "2-3 sentences citing the evidence you relied on" }`;

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

interface Verdict {
  outcome: "yes" | "no" | "inconclusive";
  reasoning: string;
}

async function askAi(
  apiKey: string,
  bet: { title: string; description: string | null; resolution_source: string },
): Promise<Verdict> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Today is ${new Date().toISOString().slice(0, 10)}.
Question: ${bet.title}
Details: ${bet.description ?? "(none)"}
How it can be verified: ${bet.resolution_source}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  const outcome = String(parsed.outcome ?? "").toLowerCase();
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";
  if (outcome !== "yes" && outcome !== "no") {
    return { outcome: "inconclusive", reasoning };
  }
  if (!reasoning) return { outcome: "inconclusive", reasoning: "" };
  return { outcome, reasoning };
}

export async function runCheck() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const nowIso = new Date().toISOString();
  const { data: bets, error } = await supabaseAdmin
    .from("group_bets")
    .select("id, title, description, resolution_source")
    .in("status", ["open", "voting"])
    .lte("closes_at", nowIso)
    .is("auto_checked_at", null)
    .not("resolution_source", "is", null)
    .limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);

  let proposed = 0;
  let inconclusive = 0;

  for (const bet of bets ?? []) {
    // Mark as attempted first so a failure never loops forever.
    await supabaseAdmin
      .from("group_bets")
      .update({ auto_checked_at: new Date().toISOString() })
      .eq("id", bet.id);

    let verdict: Verdict;
    try {
      verdict = await askAi(apiKey, bet as any);
    } catch (e) {
      console.error("[check-group-bet-outcomes] AI call failed", bet.id, (e as Error).message);
      continue;
    }

    if (verdict.outcome === "inconclusive") {
      inconclusive++;
      continue;
    }

    const deadline = new Date(Date.now() + REVIEW_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("group_bets")
      .update({
        status: "pending_auto_resolution",
        proposed_resolution: verdict.outcome,
        resolution_reason: verdict.reasoning,
        auto_resolved: true,
        auto_resolution_deadline: deadline,
      })
      .eq("id", bet.id)
      .in("status", ["open", "voting"]);
    if (upErr) {
      console.error("[check-group-bet-outcomes] update failed", bet.id, upErr.message);
      continue;
    }

    const { data: parts } = await supabaseAdmin
      .from("group_bet_participants")
      .select("user_id")
      .eq("group_bet_id", bet.id);
    const rows = (parts ?? []).map((p) => ({
      user_id: p.user_id,
      kind: "group_bet_auto_proposed",
      payload: {
        group_bet_id: bet.id,
        title: bet.title,
        resolution: verdict.outcome,
        reasoning: verdict.reasoning,
        deadline,
      },
    }));
    if (rows.length > 0) await supabaseAdmin.from("notifications").insert(rows as any);
    proposed++;
  }

  return { scanned: bets?.length ?? 0, proposed, inconclusive };
}

export const Route = createFileRoute("/api/public/hooks/check-group-bet-outcomes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runCheck();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[check-group-bet-outcomes] failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
