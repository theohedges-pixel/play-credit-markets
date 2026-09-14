import { createClient } from "@supabase/supabase-js";
import { parseYesProbability, seedPools } from "@/lib/polymarket-odds";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: orphanRows } = await sb
  .from("markets")
  .select("id, polymarket_id, yes_pool, no_pool")
  .eq("status", "open")
  .not("polymarket_id", "is", null)
  .is("polymarket_event_id", null);
const orphans = new Map((orphanRows ?? []).map((r: any) => [String(r.polymarket_id), r]));

const { data: evRows } = await sb
  .from("markets")
  .select("polymarket_event_id")
  .eq("status", "open")
  .not("polymarket_event_id", "is", null);
const eventIds = [...new Set((evRows ?? []).map((r: any) => String(r.polymarket_event_id)))];

const { data: traded } = await sb.from("trades").select("market_id");
const tradedSet = new Set((traded ?? []).map((t: any) => t.market_id));

let adopted = 0;
let repriced = 0;
const report: string[] = [];

for (const eventId of eventIds) {
  const r = await fetch(`https://gamma-api.polymarket.com/events?id=${eventId}`, {
    headers: { accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!r.ok) continue;
  const ev = (await r.json())[0];
  if (!ev) continue;
  const open = (ev.markets ?? []).filter((m: any) => !m.closed && m.active !== false);
  if (!ev.negRisk && !(open.length >= 2 && open.every((m: any) => (m.groupItemTitle ?? "").trim()) && !open.some((m: any) => (m.sportsMarketType ?? "").trim()))) continue;
  for (const m of open) {
    const row = orphans.get(String(m.id));
    if (!row) continue;
    await sb
      .from("markets")
      .update({
        polymarket_event_id: String(ev.id),
        polymarket_event_slug: ev.slug ?? null,
        polymarket_event_title: ev.title ?? null,
        polymarket_neg_risk_id: m.negRiskMarketID ? String(m.negRiskMarketID) : null,
        group_item_title: m.groupItemTitle?.trim() || null,
        event_mutually_exclusive: true,
        upstream_outcome_count: open.length,
      })
      .eq("id", row.id);
    adopted++;
    report.push(`adopt ${ev.title} :: ${m.groupItemTitle}`);
  }
  // Reprice every untraded member of this event from live upstream odds.
  const { data: members } = await sb
    .from("markets")
    .select("id, polymarket_id, yes_pool, no_pool")
    .eq("polymarket_event_id", String(ev.id))
    .eq("status", "open");
  for (const mem of members ?? []) {
    if (tradedSet.has(mem.id)) continue;
    const up = open.find((m: any) => String(m.id) === String(mem.polymarket_id));
    if (!up) continue;
    const p = parseYesProbability(up);
    if (p === null) continue;
    const pools = seedPools(p);
    const cur = Number(mem.no_pool) / (Number(mem.yes_pool) + Number(mem.no_pool));
    const next = pools.no_pool / (pools.yes_pool + pools.no_pool);
    if (Math.abs(cur - next) < 0.005) continue;
    await sb.from("markets").update(pools).eq("id", mem.id);
    await sb.from("price_history").insert({ market_id: mem.id, yes_price: next });
    repriced++;
  }
}
console.log(report.join("\n"));
console.log({ adopted, repriced, orphansTotal: orphans.size });
