import { verifyCronSecret } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

interface AiSuggestion {
  title: string;
  description: string;
  category_slug: string;
  suggested_closes_at: string;
  source_summary?: string;
}

const SYSTEM = `You are a research assistant for a play-money prediction market platform.
Generate 10-15 distinct, currently topical prediction-market ideas people are actively
speculating about in the news / online discussion: politics, sports, crypto, pop culture,
tech, science. Each must be phrased as a clear YES/NO question with a verifiable resolution.

Return STRICT JSON only:
{
  "suggestions": [
    {
      "title": "Will <X> happen before <date>?",
      "description": "1-2 sentence neutral context. State what counts as YES vs NO.",
      "category_slug": "politics" | "crypto" | "sports" | "tech" | "pop-culture" | "science",
      "suggested_closes_at": "ISO-8601 UTC timestamp, 1-180 days from today",
      "source_summary": "Short note about why this is trending right now"
    }
  ]
}

Rules: avoid topics already resolved, no duplicates, no PII, no offensive content.`;

async function generateSuggestions(apiKey: string): Promise<AiSuggestion[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Today is ${new Date().toISOString().slice(0, 10)}. Generate the suggestions now.` },
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
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  return arr.filter(
    (s: unknown): s is AiSuggestion =>
      !!s && typeof (s as AiSuggestion).title === "string" &&
      typeof (s as AiSuggestion).suggested_closes_at === "string",
  );
}

export async function runDiscover() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const suggestions = await generateSuggestions(apiKey);
  if (suggestions.length === 0) return { inserted: 0, scanned: 0 };

  // Load categories for slug -> id mapping
  const { data: cats } = await supabaseAdmin.from("categories").select("id, slug");
  const catBySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));

  // Existing markets + pending suggestions for dedup
  const { data: existingMarkets } = await supabaseAdmin
    .from("markets")
    .select("title")
    .limit(500);
  const { data: pendingSugg } = await (supabaseAdmin as any)
    .from("market_suggestions")
    .select("title")
    .eq("status", "pending");

  const existingTitles = new Set<string>([
    ...((existingMarkets ?? []).map((m) => m.title.toLowerCase())),
    ...(((pendingSugg as { title: string }[] | null) ?? []).map((s) => s.title.toLowerCase())),
  ]);

  const isDuplicate = (title: string) => {
    const t = title.toLowerCase();
    if (existingTitles.has(t)) return true;
    // substring check both directions
    for (const ex of existingTitles) {
      if (ex.length > 15 && (ex.includes(t) || t.includes(ex))) return true;
    }
    return false;
  };

  const now = Date.now();
  const minClose = now + 24 * 60 * 60 * 1000;
  const maxClose = now + 365 * 24 * 60 * 60 * 1000;

  const rows = suggestions
    .filter((s) => !isDuplicate(s.title))
    .map((s) => {
      const closes = new Date(s.suggested_closes_at).getTime();
      if (!Number.isFinite(closes) || closes < minClose || closes > maxClose) return null;
      existingTitles.add(s.title.toLowerCase());
      return {
        title: s.title.slice(0, 200),
        description: (s.description ?? "").slice(0, 1000),
        category_id: catBySlug.get(s.category_slug) ?? null,
        suggested_closes_at: new Date(closes).toISOString(),
        source_summary: (s.source_summary ?? "").slice(0, 500),
        status: "pending" as const,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (rows.length === 0) return { inserted: 0, scanned: suggestions.length };

  const { error, data } = await (supabaseAdmin as any)
    .from("market_suggestions")
    .insert(rows)
    .select("id");
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("app_settings")
    .upsert({
      key: "last_market_discovery",
      value: { at: new Date().toISOString(), inserted: data?.length ?? 0 },
      updated_at: new Date().toISOString(),
    });

  return { inserted: data?.length ?? 0, scanned: suggestions.length };
}

export const Route = createFileRoute("/api/public/hooks/discover-trending-markets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runDiscover();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[discover-trending-markets] failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
