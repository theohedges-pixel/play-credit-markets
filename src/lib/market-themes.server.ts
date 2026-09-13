/**
 * AI-derived sub-themes within each market category.
 *
 * Two distinct jobs live here:
 *  - regenerateCategoryThemes(): the periodic/manual full rebuild. It looks at
 *    the CURRENT open markets in a category and proposes a fresh theme set that
 *    reflects what's actually listed right now, then replaces that category's
 *    themes + assignments wholesale. Nothing is merged forward, on purpose —
 *    stale themes from a previous mix would outlive the markets that produced
 *    them.
 *  - tagNewMarket(): the lightweight per-market check run at creation time. It
 *    only matches against the theme set the last full run produced; it never
 *    invents a theme. A market matching none stays untagged until the next run.
 */

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

/** Categories with fewer open markets than this have no meaningful sub-structure. */
export const MIN_MARKETS_FOR_THEMES = 8;

interface MarketLite {
  id: string;
  title: string;
  description?: string | null;
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : stripFences(text));
}

async function askAi(apiKey: string, system: string, user: string): Promise<any> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 402/403 are terminal (credits / policy); 429 and 5xx are transient. Either
    // way the caller decides — we never silently swallow a gateway failure.
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return parseJson(json?.choices?.[0]?.message?.content ?? "{}");
}

const THEME_SYSTEM = `You organise a prediction-market category into sub-themes.

You are given the FULL list of markets currently open in one category. Propose 4-8 sub-themes
that meaningfully group THIS specific mix — not a generic taxonomy. Themes may overlap, and a
market may belong to several, one, or none.

Then assign every market to the themes it fits, by its numeric index.

Rules:
- Theme names are short, human, title-case, 1-4 words ("US Elections", "Fed & Economy").
- No theme that would hold fewer than 2 of the listed markets.
- No theme that would hold nearly all of them (that is just the category again).
- Never invent markets or indexes that were not listed.

Return STRICT JSON ONLY:
{ "themes": [ { "name": "US Elections", "markets": [0, 4, 7] } ] }`;

const ASSIGN_SYSTEM = `You tag ONE prediction market with sub-themes drawn from a fixed list.

Choose only from the theme names provided. Pick every theme the market genuinely belongs to —
zero, one, or several. Returning an empty list is correct and expected when nothing fits well.
Never invent a new theme name.

Return STRICT JSON ONLY: { "themes": ["Exact Theme Name", ...] }`;

export interface CategoryThemeResult {
  category: string;
  status: "regenerated" | "skipped";
  reason?: string;
  markets: number;
  themes: { name: string; markets: number }[];
}

/** Full rebuild of one category's theme set from its currently open markets. */
export async function regenerateCategoryThemes(
  supabaseAdmin: any,
  apiKey: string,
  category: { id: string; name: string },
): Promise<CategoryThemeResult> {
  const { data: markets, error } = await supabaseAdmin
    .from("markets")
    .select("id, title, description")
    .eq("category_id", category.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const list: MarketLite[] = markets ?? [];
  if (list.length < MIN_MARKETS_FOR_THEMES) {
    return {
      category: category.name,
      status: "skipped",
      reason: `only ${list.length} open market${list.length === 1 ? "" : "s"} (need ${MIN_MARKETS_FOR_THEMES})`,
      markets: list.length,
      themes: [],
    };
  }

  const prompt = `Category: ${category.name}
Open markets (index. title — description):
${list
  .map(
    (m, i) => `${i}. ${m.title}${m.description ? ` — ${String(m.description).slice(0, 160)}` : ""}`,
  )
  .join("\n")}`;

  const parsed = await askAi(apiKey, THEME_SYSTEM, prompt);
  const proposed: { name: string; markets: number[] }[] = Array.isArray(parsed?.themes)
    ? parsed.themes
    : [];

  // Normalise, drop junk, and collapse names that differ only by case.
  const seen = new Set<string>();
  const themes = proposed
    .map((t) => ({
      name: String(t?.name ?? "").trim().slice(0, 60),
      idx: (Array.isArray(t?.markets) ? t.markets : [])
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n >= 0 && n < list.length),
    }))
    .filter((t) => {
      if (!t.name || t.idx.length < 2) return false;
      const key = t.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  if (themes.length === 0) {
    return {
      category: category.name,
      status: "skipped",
      reason: "AI proposed no usable themes",
      markets: list.length,
      themes: [],
    };
  }

  // Replace wholesale. Tags cascade away with their themes.
  const { error: delErr } = await supabaseAdmin
    .from("market_themes")
    .delete()
    .eq("category_id", category.id);
  if (delErr) throw new Error(delErr.message);

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("market_themes")
    .insert(themes.map((t) => ({ category_id: category.id, name: t.name })))
    .select("id, name");
  if (insErr) throw new Error(insErr.message);

  const idByName = new Map<string, string>(
    (inserted ?? []).map((r: { id: string; name: string }) => [r.name, r.id]),
  );

  const tagRows: { market_id: string; theme_id: string }[] = [];
  for (const t of themes) {
    const themeId = idByName.get(t.name);
    if (!themeId) continue;
    for (const i of new Set(t.idx)) tagRows.push({ market_id: list[i]!.id, theme_id: themeId });
  }
  if (tagRows.length) {
    const { error: tagErr } = await supabaseAdmin.from("market_theme_tags").insert(tagRows);
    if (tagErr) throw new Error(tagErr.message);
  }

  return {
    category: category.name,
    status: "regenerated",
    markets: list.length,
    themes: themes.map((t) => ({ name: t.name, markets: new Set(t.idx).size })),
  };
}

/** Regenerate every category that clears the market-count threshold. */
export async function regenerateAllThemes(supabaseAdmin: any, apiKey: string) {
  const { data: cats, error } = await supabaseAdmin.from("categories").select("id, name").order("name");
  if (error) throw new Error(error.message);

  const results: CategoryThemeResult[] = [];
  for (const c of cats ?? []) {
    try {
      results.push(await regenerateCategoryThemes(supabaseAdmin, apiKey, c));
    } catch (e) {
      results.push({
        category: c.name,
        status: "skipped",
        reason: (e as Error).message,
        markets: 0,
        themes: [],
      });
    }
  }
  const regenerated = results.filter((r) => r.status === "regenerated");
  return {
    categories: results.length,
    regenerated: regenerated.length,
    themes: regenerated.reduce((n, r) => n + r.themes.length, 0),
    results,
  };
}

/**
 * Creation-time tagging: match ONE new market against its category's current
 * themes. Never regenerates and never invents a theme; failure is non-fatal —
 * the market simply stays untagged until the next full run.
 */
export async function tagNewMarket(
  supabaseAdmin: any,
  apiKey: string,
  market: { id: string; title: string; description?: string | null; category_id: string | null },
): Promise<string[]> {
  if (!market.category_id) return [];
  try {
    const { data: themes } = await supabaseAdmin
      .from("market_themes")
      .select("id, name")
      .eq("category_id", market.category_id);
    const available: { id: string; name: string }[] = themes ?? [];
    if (available.length === 0) return [];

    const parsed = await askAi(
      apiKey,
      ASSIGN_SYSTEM,
      `Available themes: ${available.map((t) => t.name).join(", ")}

Market: ${market.title}
${market.description ? `Details: ${String(market.description).slice(0, 400)}` : ""}`,
    );
    const picked: string[] = (Array.isArray(parsed?.themes) ? parsed.themes : []).map((n: unknown) =>
      String(n).trim().toLowerCase(),
    );
    const matched = available.filter((t) => picked.includes(t.name.toLowerCase()));
    if (matched.length === 0) return [];

    await supabaseAdmin
      .from("market_theme_tags")
      .upsert(
        matched.map((t) => ({ market_id: market.id, theme_id: t.id })),
        { onConflict: "market_id,theme_id" },
      );
    return matched.map((t) => t.name);
  } catch (e) {
    console.warn("[market-themes] creation-time tagging failed:", (e as Error).message);
    return [];
  }
}
