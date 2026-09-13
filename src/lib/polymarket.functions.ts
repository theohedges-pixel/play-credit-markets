import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseYesProbability, seedPools } from "@/lib/polymarket-odds";

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
  outcomePrices?: string | string[] | null;
  lastTradePrice?: number | string | null;
  bestBid?: number | string | null;
  bestAsk?: number | string | null;
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
    let r: Response;
    try {
      r = await fetch(url, { headers: { accept: "application/json" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Couldn't reach Polymarket: ${msg}`);
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Polymarket fetch failed (${r.status}): ${body.slice(0, 200)}`);
    }
    let remote: PolyMarket[];
    try {
      remote = (await r.json()) as PolyMarket[];
    } catch {
      throw new Error("Polymarket returned an invalid response");
    }

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

    const rows = fresh.map((c, i) => {
      const prob = parseYesProbability(c.m);
      if (prob === null) {
        console.warn("[polymarket import] no usable odds, seeding neutral:", c.m.question);
      }
      const pools = seedPools(prob);
      return {
      creator_id: context.userId,
      title: c.m.question!,
      description:
        (c.m.description ?? "Imported from Polymarket via AI.").slice(0, 1000) +
        "\n\nSource: Polymarket",
      category_id: catByName.get(cats[i]) ?? null,
      closes_at: new Date(c.closes).toISOString(),
      status: "open" as const,
      yes_pool: pools.yes_pool,
      no_pool: pools.no_pool,
      volume: 0,
      source: "polymarket",
      polymarket_id: c.m.id ?? null,
      };
    });

    const { error: insErr, data: inserted } = await context.supabase
      .from("markets")
      .insert(rows)
      .select("id, yes_pool, no_pool");
    if (insErr) throw new Error(insErr.message);
    if (inserted && inserted.length > 0) {
      await context.supabase.from("price_history").insert(
        inserted.map((m: { id: string; yes_pool: number; no_pool: number }) => ({
          market_id: m.id,
          yes_price: Number(m.no_pool) / (Number(m.yes_pool) + Number(m.no_pool)),
        })),
      );
    }

    return {
      imported: inserted?.length ?? 0,
      skipped: candidates.length - fresh.length,
      message: `Imported ${inserted?.length ?? 0} markets from Polymarket.`,
    };
  });
