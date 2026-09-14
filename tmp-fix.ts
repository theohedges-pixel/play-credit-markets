import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { completeMarketGroups } from "./src/lib/polymarket-groups.server";
import { parseYesProbability, seedPools } from "./src/lib/polymarket-odds";

const UA = { "User-Agent": "Mozilla/5.0" };

// ---- 1. Re-rank + complete every open grouped event with the price ranking ----
const complete = await completeMarketGroups(supabaseAdmin, { budget: 400 });
console.log("COMPLETION imported", complete.imported);
for (const e of complete.events) {
  if (e.mutuallyExclusive && (e.imported > 0 || !e.complete)) {
    console.log(` ${e.title}: ${e.before} -> ${e.before + e.imported} of ${e.upstream}`);
  }
}

// ---- 2. Re-seed pools for every untraded open import, from live upstream price ----
const { data: rows } = await supabaseAdmin
  .from("markets")
  .select("id, polymarket_id, yes_pool, no_pool")
  .eq("status", "open")
  .eq("created_via", "polymarket_import")
  .not("polymarket_id", "is", null);

const { data: traded } = await supabaseAdmin.from("trades").select("market_id");
const tradedIds = new Set((traded ?? []).map((t: any) => t.market_id));

const candidates = (rows ?? []).filter((r: any) => !tradedIds.has(r.id));
console.log("untraded open imports:", candidates.length, "of", (rows ?? []).length);

let updated = 0;
let unchanged = 0;
let noPrice = 0;
for (let i = 0; i < candidates.length; i += 20) {
  const chunk = candidates.slice(i, i + 20);
  const qs = chunk.map((c: any) => `id=${c.polymarket_id}`).join("&");
  const res = await fetch(`https://gamma-api.polymarket.com/markets?${qs}&limit=50`, {
    headers: UA,
  });
  if (!res.ok) {
    console.error("gamma", res.status);
    continue;
  }
  const list = (await res.json()) as any[];
  const byId = new Map(list.map((m) => [String(m.id), m]));
  for (const c of chunk) {
    const m = byId.get(String(c.polymarket_id));
    if (!m) {
      noPrice++;
      continue;
    }
    const p = parseYesProbability(m);
    if (p === null) {
      noPrice++;
      continue;
    }
    const pools = seedPools(p);
    if (pools.yes_pool === Number(c.yes_pool) && pools.no_pool === Number(c.no_pool)) {
      unchanged++;
      continue;
    }
    // re-verify no trades right before writing
    const { count } = await supabaseAdmin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("market_id", c.id);
    if ((count ?? 0) > 0) continue;
    const { error } = await supabaseAdmin
      .from("markets")
      .update({ yes_pool: pools.yes_pool, no_pool: pools.no_pool })
      .eq("id", c.id);
    if (error) {
      console.error("update failed", c.id, error.message);
      continue;
    }
    await supabaseAdmin.from("price_history").insert({
      market_id: c.id,
      yes_price: pools.no_pool / (pools.yes_pool + pools.no_pool),
    });
    updated++;
  }
  await new Promise((r) => setTimeout(r, 250));
}
console.log("RESEED updated", updated, "unchanged", unchanged, "no upstream price", noPrice);
