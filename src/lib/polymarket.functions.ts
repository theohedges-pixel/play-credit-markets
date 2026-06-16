import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface PolyMarket {
  id?: string;
  question?: string;
  description?: string;
  endDate?: string;
  end_date_iso?: string;
  category?: string;
  volume?: string | number;
  closed?: boolean;
  active?: boolean;
}

const CATEGORY_NAMES = ["Politics", "Crypto", "Sports", "Tech", "Pop Culture", "Science"] as const;

async function classifyWithAI(
  apiKey: string,
  items: { title: string; description: string }[],
): Promise<string[]> {
  const fallback = () => items.map(() => "Pop Culture");
  const list = items.map((it, i) => `${i + 1}. ${it.title}`).join("\n");
  const prompt = `Classify each prediction market into EXACTLY ONE of: ${CATEGORY_NAMES.join(", ")}.
Reply with a JSON array of strings only, length ${items.length}, in the same order. No prose.

Markets:
${list}`;

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You output only valid JSON arrays of category strings." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    console.error("[AI classify] network error", e);
    return fallback();
  }

  if (!res.ok) {
    console.error("[AI classify] non-ok", res.status, await res.text().catch(() => ""));
    return fallback();
  }
  try {
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(text);
    const arr: unknown = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).categories;
    if (Array.isArray(arr)) {
      return arr.map((c) => {
        const s = String(c);
        const match = CATEGORY_NAMES.find((n) => n.toLowerCase() === s.toLowerCase());
        return match ?? "Pop Culture";
      });
    }
  } catch (e) {
    console.error("[AI classify] parse error", e);
  }
  return fallback();
}

export interface ImportResult {
  imported: number;
  skipped: number;
  message: string;
}

export const importPolymarketMarkets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Lovable AI not configured");

    // Fetch top active markets from Polymarket's public gamma API
    const url =
      "https://gamma-api.polymarket.com/markets?active=true&closed=false&archived=false&limit=25&order=volume24hr&ascending=false";
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`Polymarket fetch failed: ${r.status}`);
    const remote = (await r.json()) as PolyMarket[];

    // Filter to ones that close in the future and have a question
    const now = Date.now();
    const candidates = remote
      .filter((m) => m.question && (m.endDate || m.end_date_iso))
      .map((m) => {
        const closes = new Date(m.endDate ?? m.end_date_iso ?? "").getTime();
        return { m, closes };
      })
      .filter((x) => Number.isFinite(x.closes) && x.closes > now + 60_000)
      .slice(0, 15);

    if (candidates.length === 0) {
      return { imported: 0, skipped: 0, message: "No suitable Polymarket markets right now." };
    }

    // Dedupe against existing titles
    const titles = candidates.map((c) => c.m.question!);
    const { data: existing } = await context.supabase
      .from("markets")
      .select("title")
      .in("title", titles);
    const existingSet = new Set((existing ?? []).map((e: { title: string }) => e.title));
    const fresh = candidates.filter((c) => !existingSet.has(c.m.question!));

    if (fresh.length === 0) {
      return { imported: 0, skipped: candidates.length, message: "All top markets already imported." };
    }

    // AI categorize
    const cats = await classifyWithAI(
      apiKey,
      fresh.map((c) => ({
        title: c.m.question ?? "",
        description: (c.m.description ?? "").slice(0, 300),
      })),
    );

    // Look up category ids
    const { data: catRows } = await context.supabase
      .from("categories")
      .select("id, name")
      .in("name", CATEGORY_NAMES as unknown as string[]);
    const catByName = new Map<string, string>(
      (catRows ?? []).map((c: { id: string; name: string }) => [c.name, c.id]),
    );

    const rows = fresh.map((c, i) => ({
      creator_id: context.userId,
      title: c.m.question!,
      description:
        (c.m.description ?? "Imported from Polymarket via AI.").slice(0, 1000) +
        "\n\nSource: Polymarket",
      category_id: catByName.get(cats[i]) ?? null,
      closes_at: new Date(c.closes).toISOString(),
      status: "open" as const,
      yes_pool: 1000,
      no_pool: 1000,
      volume: 0,
    }));

    const { error: insErr, data: inserted } = await context.supabase
      .from("markets")
      .insert(rows)
      .select("id");
    if (insErr) throw new Error(insErr.message);

    return {
      imported: inserted?.length ?? 0,
      skipped: candidates.length - fresh.length,
      message: `Imported ${inserted?.length ?? 0} markets from Polymarket.`,
    };
  });
