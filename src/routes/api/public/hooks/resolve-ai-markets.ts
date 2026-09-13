import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret } from "@/lib/cron-auth.server";

/**
 * Automated outcome check for regular markets that have no upstream source to
 * mirror (AI-generated, admin-approved suggestions, anything non-Polymarket).
 *
 * Mirrors the group-bet flow: propose an outcome with reasoning, notify every
 * holder of a nonzero position, then wait 24 hours before paying out. Anyone
 * holding a position can flag it during that window, which sends the market to
 * the admin "Needs resolution" queue instead. Inconclusive does the same.
 */

const REVIEW_WINDOW_HOURS = 24;
const MAX_PER_RUN = 10;

const SYSTEM = `You settle play-money prediction markets. You are given a yes/no question and
its description. Search the web for the real-world outcome before answering.

Decide whether the outcome is YES, NO, or INCONCLUSIVE. Answer INCONCLUSIVE whenever you are
not confident, the event is ambiguous, or the result is not yet publicly reported. Never guess.

Return STRICT JSON ONLY (no prose, no markdown fences):
{ "outcome": "yes" | "no" | "inconclusive", "reasoning": "2-3 sentences citing the evidence you relied on" }`;

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

interface Verdict {
  outcome: "yes" | "no" | "inconclusive";
  reasoning: string;
}

async function askAi(
  apiKey: string,
  market: { title: string; description: string | null; closes_at: string },
): Promise<Verdict> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      // Search grounding: the verdict must rest on reported reality, not recall.
      tools: [{ google_search: {} }],
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Today is ${new Date().toISOString().slice(0, 10)}.
Question: ${market.title}
Details: ${market.description ?? "(none)"}
The market closed on: ${market.closes_at}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
  } catch {
    // Grounded replies sometimes wrap the JSON in prose — pull the object out.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* fall through to inconclusive */
      }
    }
  }
  const outcome = String(parsed.outcome ?? "").toLowerCase();
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";
  if ((outcome !== "yes" && outcome !== "no") || !reasoning) {
    return { outcome: "inconclusive", reasoning };
  }
  return { outcome: outcome as "yes" | "no", reasoning };
}

export async function runResolveAiMarkets() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  // Only markets with no upstream truth to mirror; Polymarket imports are
  // settled from Gamma inside the sync job instead.
  const { data: markets, error } = await supabaseAdmin
    .from("markets")
    .select("id, title, description, closes_at, created_via")
    .eq("status", "closed")
    .is("resolution", null)
    .is("auto_checked_at", null)
    .eq("needs_manual_resolution", false)
    .neq("created_via", "polymarket_import")
    .order("closes_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);

  let proposed = 0;
  let inconclusive = 0;

  for (const m of markets ?? []) {
    // Mark attempted first so a failure can never loop forever.
    await supabaseAdmin
      .from("markets")
      .update({ auto_checked_at: new Date().toISOString() })
      .eq("id", m.id);

    let verdict: Verdict;
    try {
      verdict = await askAi(apiKey, m as any);
    } catch (e) {
      console.error("[resolve-ai-markets] AI call failed", m.id, (e as Error).message);
      continue;
    }

    if (verdict.outcome === "inconclusive") {
      inconclusive++;
      await supabaseAdmin
        .from("markets")
        .update({
          needs_manual_resolution: true,
          resolution_reason:
            verdict.reasoning ||
            "Automated check could not determine the outcome — needs manual resolution.",
        })
        .eq("id", m.id);
      continue;
    }

    const deadline = new Date(Date.now() + REVIEW_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("markets")
      .update({
        proposed_resolution: verdict.outcome,
        resolution_reason: verdict.reasoning,
        resolution_method: "ai_verified",
        auto_resolved: true,
        auto_resolution_deadline: deadline,
      })
      .eq("id", m.id)
      .eq("status", "closed")
      .is("resolution", null);
    if (upErr) {
      console.error("[resolve-ai-markets] update failed", m.id, upErr.message);
      continue;
    }
    proposed++;

    // Notify every holder of a nonzero position — they are the flaggers here.
    const { data: holders } = await supabaseAdmin
      .from("positions")
      .select("user_id, yes_shares, no_shares")
      .eq("market_id", m.id);
    const rows = (holders ?? [])
      .filter((h) => Number(h.yes_shares) > 0 || Number(h.no_shares) > 0)
      .map((h) => ({
        user_id: h.user_id,
        kind: "market_resolution_proposed",
        payload: {
          market_id: m.id,
          title: m.title,
          resolution: verdict.outcome,
          reason: verdict.reasoning,
          deadline,
        },
      }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows as any);
  }

  return { ok: true as const, checked: (markets ?? []).length, proposed, inconclusive };
}

export const Route = createFileRoute("/api/public/hooks/resolve-ai-markets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runResolveAiMarkets();
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
