import { verifyCronSecret } from "@/lib/cron-auth.server";
import { findSemanticDuplicates, verifyUnsettled } from "@/lib/market-gates.server";
import { createFileRoute } from "@tanstack/react-router";

interface AiEvent {
  title: string;
  description: string;
  category_slug: string;
  probability_yes: number;
  closes_at: string;
}

const CATEGORY_SLUGS = ["politics", "crypto", "sports", "pop-culture", "tech", "science"] as const;
const TOTAL_LIQUIDITY = 2000;
const MIN_POOL = 50;
const MAX_INSERT = 15;

const SYSTEM = `You are a real-time research desk for a play-money prediction market platform.
SEARCH THE WEB FIRST. Do not rely on your training data for topic selection — your training data
is stale and will make you propose events that have already happened. Every topic must come from
search results dated within the last 14 days.

Surface 10-15 distinct real-world events that people are actively speculating about RIGHT NOW
(politics, sports, crypto, entertainment, tech, science). Each must be a clear YES/NO question
with a verifiable resolution.

For EACH candidate, before you include it, run a second search specifically to check whether the
outcome is ALREADY publicly known, announced, reported or otherwise settled. If the answer is
already knowable today — the announcement happened, the game was played, the threshold was
crossed, the release shipped, the election was held — DROP the candidate. Only questions whose
answer is genuinely still unknown today may be returned.

Return STRICT JSON ONLY (no prose, no markdown fences):
{
  "events": [
    {
      "title": "Will <X> happen by <date>?",
      "description": "2-3 sentences of neutral context. State what counts as YES vs NO and source/why it matters.",
      "category_slug": "politics" | "crypto" | "sports" | "pop-culture" | "tech" | "science",
      "probability_yes": 0.42,
      "closes_at": "ISO-8601 UTC timestamp tied to the event's actual resolution date"
    }
  ]
}

Rules:
- probability_yes is YOUR best estimate, decimal strictly between 0.01 and 0.99 (never 0.5 by default).
- closes_at: SEARCH THE WEB for the specific, officially announced date of the real event
  (keynote date, election day, kickoff, court date, deadline) and use THAT exact date, in UTC,
  shortly after the outcome becomes publicly knowable. Never round to the end of a month,
  quarter or year, and never substitute a generic "30 days out" placeholder. If you cannot
  establish a real dated event, drop the question instead of inventing a date.
- closes_at must still fall 1-180 days from today.
- No duplicates, no already-resolved topics, no PII, no offensive content.`;

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function callAi(apiKey: string): Promise<AiEvent[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      // Search grounding so closes_at comes from the announced event date
      // rather than the model's guess.
      tools: [{ google_search: {} }],
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Today is ${new Date().toISOString().slice(0, 10)}. Return JSON with currently trending events now.`,
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (e) {
    throw new Error(`AI returned invalid JSON: ${(e as Error).message}`);
  }
  const root = parsed as { events?: unknown; data?: unknown } | unknown[];
  const arr = Array.isArray(root)
    ? root
    : Array.isArray((root as { events?: unknown }).events)
      ? ((root as { events: unknown[] }).events)
      : Array.isArray((root as { data?: unknown }).data)
        ? ((root as { data: unknown[] }).data)
        : [];
  return arr as AiEvent[];
}

function validateEvent(raw: unknown): { ev: AiEvent } | { rejected: "malformed" | "round_date" } {
  const malformed = { rejected: "malformed" as const };
  if (!raw || typeof raw !== "object") return malformed;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const description = typeof r.description === "string" ? r.description.trim() : "";
  const category_slug = typeof r.category_slug === "string" ? r.category_slug.toLowerCase().trim() : "";
  const probability_yes = typeof r.probability_yes === "number" ? r.probability_yes : Number(r.probability_yes);
  const closes_at = typeof r.closes_at === "string" ? r.closes_at : "";
  if (!title || title.length < 8) return malformed;
  if (!description) return malformed;
  if (!(CATEGORY_SLUGS as readonly string[]).includes(category_slug)) return malformed;
  if (!Number.isFinite(probability_yes) || probability_yes <= 0 || probability_yes >= 1) return malformed;
  const ts = new Date(closes_at).getTime();
  const now = Date.now();
  if (!Number.isFinite(ts)) return malformed;
  if (ts < now + 24 * 60 * 60 * 1000) return malformed;
  if (ts > now + 180 * 24 * 60 * 60 * 1000) return malformed;
  if (isSuspiciouslyRound(category_slug, new Date(ts))) {
    console.warn(
      `[generate-ai-markets] discarded round-date candidate (${new Date(ts).toISOString()}) for ${category_slug} market: "${title}" — likely a guessed date, not the real event date`,
    );
    return { rejected: "round_date" };
  }
  return { ev: { title, description, category_slug, probability_yes, closes_at: new Date(ts).toISOString() } };
}

/**
 * Hard rejection signal: the model probably guessed the date. Real events in
 * these categories rarely land exactly on the first or last day of a month,
 * so such a closes_at almost always means the date was invented rather than
 * search-verified. Categories with genuinely dateless questions (e.g. price
 * targets) are exempt.
 */
function isSuspiciouslyRound(category: string, d: Date): boolean {
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const isLastDay = d.getUTCDate() === lastOfMonth;
  const isFirstDay = d.getUTCDate() === 1;
  const datedCategories = ["tech", "politics", "sports", "pop-culture"];
  return (isLastDay || isFirstDay) && datedCategories.includes(category);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function isCloseMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 20 && nb.length > 20 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

// Staleness + topic-duplicate gates are shared with the suggestion pipeline
// and the admin approval path — see @/lib/market-gates.server.


export async function runGenerate() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const raw = await callAi(apiKey);
  const valid: AiEvent[] = [];
  let malformed = 0;
  let roundDate = 0;
  for (const r of raw) {
    const v = validateEvent(r);
    if ("ev" in v) valid.push(v.ev);
    else if (v.rejected === "round_date") roundDate++;
    else malformed++;
  }
  if (malformed) console.warn(`[generate-ai-markets] skipped ${malformed} malformed events`);
  if (roundDate) console.warn(`[generate-ai-markets] discarded ${roundDate} candidates with suspiciously round closes_at`);
  if (valid.length === 0) {
    await supabaseAdmin
      .from("app_settings")
      .upsert({
        key: "last_ai_market_run",
        value: { at: new Date().toISOString(), inserted: 0, reason: "no valid events", round_date: roundDate },
        updated_at: new Date().toISOString(),
      });
    return { inserted: 0, scanned: raw.length, malformed, round_date: roundDate };
  }

  // Existing titles for dedup
  const { data: existing } = await supabaseAdmin
    .from("markets")
    .select("title")
    .limit(2000);
  const existingTitles = (existing ?? []).map((m) => m.title);

  // Open + recently resolved markets are what the semantic pass compares against.
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("markets")
    .select("title, status, resolved_at")
    .or(`status.eq.open,resolved_at.gte.${sixtyDaysAgo}`)
    .order("created_at", { ascending: false })
    .limit(200);
  const compareTitles = (recent ?? []).map((m) => m.title);

  // Pass 1: literal dedup within batch + against DB
  const shortlist: AiEvent[] = [];
  for (const ev of valid) {
    if (existingTitles.some((t) => isCloseMatch(t, ev.title))) continue;
    if (shortlist.some((a) => isCloseMatch(a.title, ev.title))) continue;
    shortlist.push(ev);
  }

  // Pass 2: topic-level dedup against open + recently resolved markets
  const semanticDupes = await findSemanticDuplicates(apiKey, shortlist, compareTitles);
  const unique = shortlist.filter((_, i) => !semanticDupes.has(i));

  // Pass 3: grounded staleness gate — discard anything already publicly settled
  const verdicts = await Promise.all(unique.map((ev) => verifyUnsettled(apiKey, ev)));
  const accepted: AiEvent[] = [];
  let stale = 0;
  unique.forEach((ev, i) => {
    if (verdicts[i].stale) {
      stale++;
      console.warn(`[generate-ai-markets] discarded settled topic: "${ev.title}" — ${verdicts[i].reasoning}`);
      return;
    }
    if (accepted.length < MAX_INSERT) accepted.push(ev);
  });

  const duplicates = valid.length - unique.length;

  if (accepted.length === 0) {
    await supabaseAdmin.from("app_settings").upsert({
      key: "last_ai_market_run",
      value: {
        at: new Date().toISOString(),
        inserted: 0,
        reason: stale > 0 ? "all candidates duplicate or already settled" : "all duplicates",
        duplicates,
        stale,
        round_date: roundDate,
      },
      updated_at: new Date().toISOString(),
    });
    return { inserted: 0, scanned: raw.length, malformed, duplicates, stale, round_date: roundDate };
  }


  // Look up categories
  const { data: cats } = await supabaseAdmin.from("categories").select("id, slug");
  const catBySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));

  const rows = accepted.map((ev) => {
    const p = ev.probability_yes;
    let yes_pool = Math.round(TOTAL_LIQUIDITY * (1 - p));
    let no_pool = Math.round(TOTAL_LIQUIDITY * p);
    if (yes_pool < MIN_POOL) yes_pool = MIN_POOL;
    if (no_pool < MIN_POOL) no_pool = MIN_POOL;
    return {
      creator_id: null,
      title: ev.title.slice(0, 200),
      description: ev.description.slice(0, 1000),
      category_id: catBySlug.get(ev.category_slug) ?? null,
      closes_at: ev.closes_at,
      status: "open" as const,
      yes_pool,
      no_pool,
      volume: 0,
      source: "ai_generated",
      created_via: "ai_generated" as const,
    };
  });

  const { data: inserted, error } = await supabaseAdmin
    .from("markets")
    .insert(rows)
    .select("id, yes_pool, no_pool");
  if (error) throw new Error(error.message);

  // Seed price_history with a real starting point
  if (inserted && inserted.length > 0) {
    const history = inserted.map((m) => ({
      market_id: m.id,
      yes_price: Number(m.no_pool) / (Number(m.yes_pool) + Number(m.no_pool)),
    }));
    await supabaseAdmin.from("price_history").insert(history);
  }

  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("app_settings").upsert([
    { key: "last_ai_market_run", value: { at: nowIso, inserted: inserted?.length ?? 0, duplicates, stale, round_date: roundDate }, updated_at: nowIso },
    { key: "last_ai_market_count", value: { count: inserted?.length ?? 0, at: nowIso }, updated_at: nowIso },
  ]);

  return { inserted: inserted?.length ?? 0, scanned: raw.length, malformed, duplicates, stale, round_date: roundDate };
}

export const Route = createFileRoute("/api/public/hooks/generate-ai-markets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runGenerate();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[generate-ai-markets] failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
