/**
 * Shared safety gates for anything that creates a market or a market
 * suggestion: a grounded "is this already settled?" check and a topic-level
 * duplicate check. Used by the AI generator, the trending-suggestion
 * discovery job, and the admin approval path so no pipeline can bypass them.
 */

export interface GateCandidate {
  title: string;
  description?: string;
  closes_at?: string;
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const STALE_SYSTEM = `You audit candidate questions for a prediction market.
SEARCH THE WEB and decide whether the real-world outcome of the question is ALREADY publicly
known, announced, reported or otherwise settled as of today, or whether the event it refers to
has already happened or can no longer happen as described.

Return STRICT JSON ONLY:
{ "stale": true | false, "confidence": 0.0-1.0, "reasoning": "1-2 sentences citing the evidence" }
stale=true if the answer is already knowable today. If the answer is genuinely still unknown,
stale=false.`;

/** Grounded pass: is this candidate's outcome already public? */
export async function verifyUnsettled(
  apiKey: string,
  ev: GateCandidate,
): Promise<{ stale: boolean; reasoning: string }> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{ google_search: {} }],
        messages: [
          { role: "system", content: STALE_SYSTEM },
          {
            role: "user",
            content: `Today is ${new Date().toISOString().slice(0, 10)}.
Question: ${ev.title}
Details: ${ev.description ?? ""}
Proposed close: ${ev.closes_at ?? "unspecified"}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text) as {
      stale?: unknown;
      confidence?: unknown;
      reasoning?: unknown;
    };
    const confidence = Number(parsed.confidence ?? 1);
    const stale = parsed.stale === true && (!Number.isFinite(confidence) || confidence >= 0.7);
    return { stale, reasoning: String(parsed.reasoning ?? "") };
  } catch (e) {
    // The check is a gate, not a nice-to-have: if we cannot confirm the topic
    // is still open, treat it as stale rather than publish a settled one.
    console.warn(`[market-gates] staleness check failed for "${ev.title}":`, (e as Error).message);
    return { stale: true, reasoning: "verification failed" };
  }
}

const DUPE_SYSTEM = `You de-duplicate prediction market questions by TOPIC, not wording.
Two questions are duplicates when they hinge on the same underlying real-world event, entity and
outcome, even if the dates, phrasing or framing differ (e.g. "foldable iPhone at the September
event" and "foldable iPhone at the October event" are the SAME topic).
Return STRICT JSON ONLY: { "duplicates": [ { "index": <candidate index>, "matches": "<existing title or other candidate>" } ] }
Include a candidate index once if it duplicates an existing market OR an earlier candidate in the list.`;

/**
 * Topic-level duplicate detection. Returns a map of candidate index -> the
 * existing title it duplicates.
 */
export async function findSemanticDuplicates(
  apiKey: string,
  candidates: GateCandidate[],
  existingTitles: string[],
): Promise<Map<number, string>> {
  const dupes = new Map<number, string>();
  if (candidates.length === 0 || existingTitles.length === 0) return dupes;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DUPE_SYSTEM },
          {
            role: "user",
            content: `EXISTING MARKETS:\n${existingTitles.map((t) => `- ${t}`).join("\n")}\n\nCANDIDATES:\n${candidates
              .map((c, i) => `${i}. ${c.title}`)
              .join("\n")}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(stripFences(text)) as {
      duplicates?: Array<{ index?: unknown; matches?: unknown }>;
    };
    for (const d of parsed.duplicates ?? []) {
      const i = Number(d?.index);
      if (Number.isInteger(i) && i >= 0 && i < candidates.length) {
        dupes.set(i, typeof d?.matches === "string" ? d.matches : "an existing market");
      }
    }
  } catch (e) {
    console.warn("[market-gates] semantic dedupe failed:", (e as Error).message);
  }
  return dupes;
}

/** Titles of open + recently resolved markets, the comparison set for dedupe. */
export async function loadComparisonTitles(supabaseAdmin: any, days = 60): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("markets")
    .select("title, status, resolved_at")
    .or(`status.eq.open,resolved_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as Array<{ title: string }>).map((m) => m.title);
}

/**
 * Full gate for a single candidate, used immediately before a market is
 * created (admin approval). Returns a blocking reason or null.
 */
export async function screenCandidate(
  apiKey: string,
  supabaseAdmin: any,
  candidate: GateCandidate,
): Promise<{ blocked: false } | { blocked: true; reason: string }> {
  const existingTitles = await loadComparisonTitles(supabaseAdmin);
  const [dupes, verdict] = await Promise.all([
    findSemanticDuplicates(apiKey, [candidate], existingTitles),
    verifyUnsettled(apiKey, candidate),
  ]);
  const match = dupes.get(0);
  if (match) {
    return { blocked: true, reason: `This matches an existing market: "${match}"` };
  }
  if (verdict.stale) {
    return {
      blocked: true,
      reason: `This topic appears already settled: ${verdict.reasoning || "outcome is already public"}`,
    };
  }
  return { blocked: false };
}
