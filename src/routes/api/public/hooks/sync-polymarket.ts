import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret } from "@/lib/cron-auth.server";
import { parseYesProbability, seedPools } from "@/lib/polymarket-odds";

interface PolyMarket {
  id?: string;
  question?: string;
  description?: string;
  endDate?: string;
  end_date_iso?: string;
  closed?: boolean;
  active?: boolean;
  volume?: string | number;
  outcomePrices?: string | string[] | null;
  lastTradePrice?: number | string | null;
  bestBid?: number | string | null;
  bestAsk?: number | string | null;
}

const CATEGORY_NAMES = ["Politics", "Crypto", "Sports", "Tech", "Pop Culture", "Science"] as const;
const MAX_INSERTS_PER_RUN = 25;

async function classifyWithAI(
  apiKey: string,
  items: { title: string; description: string }[],
): Promise<string[]> {
  const fallback = () => items.map(() => "Pop Culture");
  if (items.length === 0) return [];
  const list = items.map((it, i) => `${i + 1}. ${it.title}`).join("\n");
  const prompt = `Classify each prediction market into EXACTLY ONE of: ${CATEGORY_NAMES.join(", ")}.
Reply with a JSON object {"categories": [...]} of strings only, length ${items.length}, in the same order.

Markets:
${list}`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You output only valid JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallback();
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text);
    const arr: unknown = Array.isArray(parsed) ? parsed : parsed?.categories;
    if (Array.isArray(arr)) {
      return arr.map((c) => {
        const s = String(c);
        return CATEGORY_NAMES.find((n) => n.toLowerCase() === s.toLowerCase()) ?? "Pop Culture";
      });
    }
  } catch (e) {
    console.error("[sync-polymarket] classify error", e);
  }
  return fallback();
}

export async function runSync() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY;

  const url =
    "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false";
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Polymarket fetch failed: ${r.status}`);
  const remote = (await r.json()) as PolyMarket[];

  const now = Date.now();
  const items = remote.filter((m) => m.question && (m.endDate || m.end_date_iso));

  // Existing markets — match by polymarket_id OR lowercased title
  const polyIds = items.map((m) => m.id).filter(Boolean) as string[];

  const { data: existingByTitle } = await supabaseAdmin
    .from("markets")
    .select("id, title, status, polymarket_id")
    .in("title", items.map((m) => m.question!));
  const { data: existingByPid } = polyIds.length
    ? await supabaseAdmin
        .from("markets")
        .select("id, title, status, polymarket_id")
        .in("polymarket_id", polyIds)
    : { data: [] as { id: string; title: string; status: string; polymarket_id: string | null }[] };

  const existing = [...(existingByTitle ?? []), ...(existingByPid ?? [])];
  const existingByTitleLower = new Map(existing.map((e) => [e.title.toLowerCase(), e]));
  const existingByPidMap = new Map(
    existing.filter((e) => e.polymarket_id).map((e) => [e.polymarket_id!, e]),
  );

  // Close resolved-upstream markets locally
  let closed = 0;
  for (const m of items) {
    if (!m.closed) continue;
    const match =
      (m.id && existingByPidMap.get(m.id)) || existingByTitleLower.get(m.question!.toLowerCase());
    if (match && match.status === "open") {
      await supabaseAdmin.from("markets").update({ status: "closed" }).eq("id", match.id);
      closed++;
    }
  }

  // Refresh odds on already-imported markets that have NEVER been traded on
  // Predikt. The NOT EXISTS check against trades is the hard guarantee: once a
  // single trade exists, the pools belong to our own CPMM and are never
  // overwritten by external data again.
  let refreshed = 0;
  {
    const { data: imports } = await supabaseAdmin
      .from("markets")
      .select("id, polymarket_id, yes_pool, no_pool")
      .eq("created_via", "polymarket_import")
      .eq("status", "open")
      .not("polymarket_id", "is", null);
    const importIds = (imports ?? []).map((m) => m.id);
    const traded = new Set<string>();
    if (importIds.length) {
      const { data: tradeRows } = await supabaseAdmin
        .from("trades")
        .select("market_id")
        .in("market_id", importIds);
      for (const t of tradeRows ?? []) traded.add(t.market_id);
    }
    const remoteByPid = new Map(items.filter((m) => m.id).map((m) => [m.id!, m]));
    for (const m of imports ?? []) {
      if (traded.has(m.id)) continue; // real Predikt trades exist — never touch pools
      const upstream = remoteByPid.get(m.polymarket_id!);
      if (!upstream) continue;
      const prob = parseYesProbability(upstream);
      if (prob === null) continue;
      const pools = seedPools(prob);
      if (
        pools.yes_pool === Number(m.yes_pool) &&
        pools.no_pool === Number(m.no_pool)
      )
        continue; // unchanged
      await supabaseAdmin
        .from("markets")
        .update({
          yes_pool: pools.yes_pool,
          no_pool: pools.no_pool,
          volume: Number(upstream.volume ?? 0) || 0,
        })
        .eq("id", m.id);
      await supabaseAdmin.from("price_history").insert({
        market_id: m.id,
        yes_price: pools.no_pool / (pools.yes_pool + pools.no_pool),
      });
      refreshed++;
    }
  }

  // New markets (top of the 24h-volume list first, capped per run)
  const fresh = items
    .filter((m) => {
      if (m.closed) return false;
      const pidHit = m.id && existingByPidMap.has(m.id);
      const titleHit = existingByTitleLower.has(m.question!.toLowerCase());
      if (pidHit || titleHit) return false;
      const closes = new Date(m.endDate ?? m.end_date_iso ?? "").getTime();
      return Number.isFinite(closes) && closes > now + 60_000;
    })
    .slice(0, MAX_INSERTS_PER_RUN);

  let inserted = 0;
  if (fresh.length && apiKey) {
    const cats = await classifyWithAI(
      apiKey,
      fresh.map((m) => ({ title: m.question ?? "", description: (m.description ?? "").slice(0, 300) })),
    );
    const { data: catRows } = await supabaseAdmin
      .from("categories")
      .select("id, name")
      .in("name", CATEGORY_NAMES as unknown as string[]);
    const catByName = new Map((catRows ?? []).map((c) => [c.name, c.id]));

    const rows = fresh.map((m, i) => {
      const prob = parseYesProbability(m);
      if (prob === null) {
        console.warn("[sync-polymarket] no usable odds, seeding neutral:", m.question);
      }
      const pools = seedPools(prob);
      return {
        creator_id: null,
        title: m.question!,
        description:
          (m.description ?? "Imported from Polymarket.").slice(0, 1000) + "\n\nSource: Polymarket",
        category_id: catByName.get(cats[i]) ?? null,
        closes_at: new Date(m.endDate ?? m.end_date_iso!).toISOString(),
        status: "open" as const,
        yes_pool: pools.yes_pool,
        no_pool: pools.no_pool,
        volume: 0,
        source: "polymarket",
        polymarket_id: m.id ?? null,
        created_via: "polymarket_import" as const,
      };
    });
    // Insert row-by-row so a rare concurrent duplicate (blocked by the unique
    // index on polymarket_id) skips just that row instead of failing the run.
    for (const row of rows) {
      const { data, error } = await supabaseAdmin
        .from("markets")
        .insert(row)
        .select("id, yes_pool, no_pool");
      if (error) {
        if (error.code === "23505") continue; // duplicate polymarket_id
        throw new Error(error.message);
      }
      inserted++;
      if (data && data.length > 0) {
        await supabaseAdmin.from("price_history").insert(
          data.map((m) => ({
            market_id: m.id,
            yes_price: Number(m.no_pool) / (Number(m.yes_pool) + Number(m.no_pool)),
          })),
        );
      }
    }
  }

  await supabaseAdmin
    .from("app_settings")
    .upsert({ key: "last_polymarket_sync", value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });

  return { inserted, closed, refreshed, scanned: items.length };
}

export const Route = createFileRoute("/api/public/hooks/sync-polymarket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runSync();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[sync-polymarket] failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
