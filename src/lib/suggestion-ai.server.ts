/**
 * AI steps for the user-submitted market pipeline:
 *  - `moderateSubmission`: content/safety screen (offensive, private individuals,
 *    no checkable resolution). Runs before anything reaches the admin queue.
 *  - `convertSubmission`: turns raw user text into a properly-formed market with
 *    a searched close date and a starting probability, for admin review.
 *
 * The staleness and topic-duplicate gates are NOT here on purpose — they are
 * shared with the AI generator and the approval path in market-gates.server.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJson(text: string): Record<string, unknown> {
  const m = stripFences(text).match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text) as Record<string, unknown>;
}

const MODERATION_SYSTEM = `You screen ideas submitted by members of a free, play-money prediction
market used by a general and partly teenage audience. No real money is involved.

REJECT the submission if ANY of these apply:
- offensive, hateful, sexual or harassing content
- it targets, names or is about a private individual (anyone who is not a public figure acting
  in their public role)
- it is about ANY person's personal life, death, health, illness, arrest, criminal charges,
  divorce, relationships or similar — reject these even for public figures
- there is no checkable resolution: no objective, publicly verifiable answer, or no date by
  which the answer becomes knowable
- it is not a question about a future real-world event at all (spam, gibberish, a statement)

ALLOW ordinary questions about elections, policy, sports results, markets and prices, company
and product announcements, science, awards and entertainment releases.

Return STRICT JSON ONLY:
{ "allowed": true | false, "reason": "one short sentence addressed to the submitter, plain and
non-judgemental, explaining why it cannot be used. Empty string when allowed." }`;

export async function moderateSubmission(
  apiKey: string,
  userText: string,
): Promise<{ allowed: boolean; reason: string }> {
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: MODERATION_SYSTEM },
          { role: "user", content: `Submission: ${userText}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    const json = await res.json();
    const parsed = parseJson(json?.choices?.[0]?.message?.content ?? "{}");
    const allowed = parsed.allowed === true;
    return {
      allowed,
      reason: allowed ? "" : String(parsed.reason ?? "This idea can't be used as a market."),
    };
  } catch (e) {
    // A safety gate that cannot run must not wave the submission through.
    console.warn("[suggestion-ai] moderation failed:", (e as Error).message);
    return {
      allowed: false,
      reason: "We couldn't check this submission right now. Please try again in a few minutes.",
    };
  }
}

export interface ConvertedMarket {
  title: string;
  description: string;
  category_slug: string;
  closes_at: string;
  probability_yes: number;
}

const CATEGORY_SLUGS = ["politics", "crypto", "sports", "pop-culture", "tech", "science"] as const;

const CONVERT_SYSTEM = `You turn a rough idea from a member of a play-money prediction market into
a properly-formed YES/NO market. SEARCH THE WEB to establish the real, officially announced date
of the event and the current state of play.

Return STRICT JSON ONLY:
{
  "title": "Will <X> happen by <date>? — a single precise YES/NO question, under 140 characters",
  "description": "2-3 neutral sentences. State exactly what counts as YES and what counts as NO, and name the source that settles it.",
  "category_slug": "politics" | "crypto" | "sports" | "pop-culture" | "tech" | "science",
  "closes_at": "ISO-8601 UTC timestamp, shortly after the outcome becomes publicly knowable",
  "probability_yes": 0.42
}

Rules:
- Stay faithful to what the submitter asked; make it precise, do not replace it with a different question.
- closes_at must come from the SEARCHED real event date (election day, kickoff, keynote, deadline),
  1-180 days from today. Never round to the first or last day of a month, quarter or year, and never
  use a generic "30 days out" placeholder.
- probability_yes is your best estimate, strictly between 0.01 and 0.99, never a lazy 0.5.`;

export async function convertSubmission(
  apiKey: string,
  userText: string,
  categoryHint?: string | null,
): Promise<ConvertedMarket> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      tools: [{ google_search: {} }],
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CONVERT_SYSTEM },
        {
          role: "user",
          content: `Today is ${new Date().toISOString().slice(0, 10)}.
Submitted idea: ${userText}
Category hint from the submitter: ${categoryHint || "none"}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}`);
  const json = await res.json();
  const parsed = parseJson(json?.choices?.[0]?.message?.content ?? "{}");

  const title = String(parsed.title ?? "").trim();
  const description = String(parsed.description ?? "").trim();
  const slug = String(parsed.category_slug ?? "").toLowerCase().trim();
  const probability = Number(parsed.probability_yes);
  const ts = new Date(String(parsed.closes_at ?? "")).getTime();

  if (title.length < 8 || !description) throw new Error("The AI could not form a clear question from this idea.");
  if (!Number.isFinite(ts)) throw new Error("The AI could not establish a real close date for this idea.");
  const now = Date.now();
  if (ts < now + 24 * 3600 * 1000 || ts > now + 180 * 24 * 3600 * 1000) {
    throw new Error("The AI's close date is outside the allowed 1-180 day window.");
  }
  const d = new Date(ts);
  if (isSuspiciouslyRound(slug, d)) {
    // Same hard rejection the generator applies: a first/last-of-month date in a
    // dated category almost always means the date was guessed, not searched.
    throw new Error(
      `The AI returned a suspiciously round close date (${d.toISOString().slice(0, 10)}) — set the real event date by hand before approving.`,
    );
  }

  return {
    title: title.slice(0, 200),
    description: description.slice(0, 1000),
    category_slug: (CATEGORY_SLUGS as readonly string[]).includes(slug) ? slug : "",
    closes_at: d.toISOString(),
    probability_yes: Number.isFinite(probability) && probability > 0 && probability < 1 ? probability : 0.5,
  };
}

function isSuspiciouslyRound(category: string, d: Date): boolean {
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const datedCategories = ["tech", "politics", "sports", "pop-culture"];
  return (d.getUTCDate() === 1 || d.getUTCDate() === lastOfMonth) && datedCategories.includes(category);
}
