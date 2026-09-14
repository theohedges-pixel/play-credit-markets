/**
 * Group completion for multi-outcome Polymarket events.
 *
 * Polymarket exposes two very different kinds of multi-market event:
 *
 *  - `negRisk: true`  — one mutually exclusive question with N outcomes
 *                       (election winner, championship winner, exact score,
 *                       price ladder). Every outcome carries `groupItemTitle`
 *                       and `sportsMarketType` is null.
 *  - `negRisk: false` — a prop collection hung off a single fixture
 *                       (moneyline + spreads + totals + first blood + ...).
 *                       `sportsMarketType` varies row by row. These are NOT
 *                       outcomes of one question and must never be grouped.
 *
 * We complete and group only the first kind. The second kind is flagged
 * `event_mutually_exclusive = false` so the list renders each market on its own.
 *
 * When a mutually exclusive event has more outcomes than MAX_PER_GROUP we import
 * the highest-volume ones and record the true upstream total in
 * `upstream_outcome_count`, so the card can say "20 of 52 outcomes".
 */
import { parseYesProbability, seedPools } from "@/lib/polymarket-odds";
import { buildImportedDescription } from "@/lib/polymarket-description";
import { yesClobTokenId, backfillMarketHistory, THROTTLE_MS } from "@/lib/polymarket-history.server";

/** Most outcomes we ever hold for one event: the biggest names, by volume. */
export const MAX_PER_GROUP = 20;

interface GammaMarket {
  id?: string | number;
  question?: string;
  description?: string;
  endDate?: string;
  end_date_iso?: string;
  gameStartTime?: string | null;
  closed?: boolean;
  active?: boolean;
  volume?: string | number;
  volumeNum?: string | number;
  outcomes?: string | string[] | null;
  outcomePrices?: string | string[] | null;
  lastTradePrice?: number | string | null;
  bestBid?: number | string | null;
  bestAsk?: number | string | null;
  clobTokenIds?: string | string[] | null;
  groupItemTitle?: string | null;
  sportsMarketType?: string | null;
  negRiskMarketID?: string | null;
}

interface GammaEvent {
  id?: string | number;
  slug?: string;
  title?: string;
  negRisk?: boolean;
  markets?: GammaMarket[];
}

export interface EventResult {
  eventId: string;
  title: string;
  mutuallyExclusive: boolean;
  before: number;
  upstream: number;
  imported: number;
  /** true when we now hold every open upstream outcome. */
  complete: boolean;
  error?: string;
}

function vol(m: GammaMarket): number {
  const n = Number(m.volumeNum ?? m.volume);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const GAME_GRACE_MS = 6 * 60 * 60 * 1000;

function closesAt(m: GammaMarket): string | null {
  const endRaw = m.endDate ?? m.end_date_iso ?? null;
  const end = endRaw ? new Date(endRaw).getTime() : NaN;
  const start = m.gameStartTime ? new Date(m.gameStartTime.replace(" ", "T")).getTime() : NaN;
  const cands = [end, Number.isFinite(start) ? start + GAME_GRACE_MS : NaN].filter((n) =>
    Number.isFinite(n),
  );
  if (cands.length === 0) return null;
  return new Date(Math.min(...cands)).toISOString();
}

async function fetchEvent(eventId: string): Promise<GammaEvent | null> {
  try {
    const r = await fetch(`https://gamma-api.polymarket.com/events?id=${encodeURIComponent(eventId)}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const body = await r.json();
    const ev = Array.isArray(body) ? body[0] : body;
    return ev ?? null;
  } catch {
    return null;
  }
}

/**
 * Fill in missing siblings for every open grouped import.
 *
 * @param budget maximum NEW markets inserted across all events in this run,
 *        so a sync run stays bounded. The backlog pass uses a large budget.
 */
export async function completeMarketGroups(
  supabaseAdmin: any,
  opts: { budget?: number; eventIds?: string[] } = {},
): Promise<{ imported: number; events: EventResult[] }> {
  const budgetTotal = opts.budget ?? 40;
  let budget = budgetTotal;

  const { data: openRows } = await supabaseAdmin
    .from("markets")
    .select("id, polymarket_id, polymarket_event_id, polymarket_event_title, category_id")
    .eq("status", "open")
    .eq("created_via", "polymarket_import")
    .not("polymarket_event_id", "is", null);

  const rows = (openRows ?? []) as {
    id: string;
    polymarket_id: string | null;
    polymarket_event_id: string;
    polymarket_event_title: string | null;
    category_id: string | null;
  }[];

  const byEvent = new Map<string, typeof rows>();
  for (const r of rows) {
    if (opts.eventIds && !opts.eventIds.includes(r.polymarket_event_id)) continue;
    const list = byEvent.get(r.polymarket_event_id) ?? [];
    list.push(r);
    byEvent.set(r.polymarket_event_id, list);
  }

  const results: EventResult[] = [];
  let imported = 0;

  for (const [eventId, members] of byEvent) {
    const ev = await fetchEvent(eventId);
    const title = ev?.title ?? members[0]?.polymarket_event_title ?? eventId;
    if (!ev) {
      results.push({
        eventId,
        title,
        mutuallyExclusive: false,
        before: members.length,
        upstream: 0,
        imported: 0,
        complete: false,
        error: "event not found upstream",
      });
      continue;
    }

    const upstreamOpen = (ev.markets ?? []).filter((m) => !m.closed && m.active !== false);
    const memberIds = members.map((m) => m.id);

    // Prop collections: flagged, never grouped, never completed.
    if (!ev.negRisk) {
      await supabaseAdmin
        .from("markets")
        .update({ event_mutually_exclusive: false, upstream_outcome_count: upstreamOpen.length })
        .in("id", memberIds);
      results.push({
        eventId,
        title,
        mutuallyExclusive: false,
        before: members.length,
        upstream: upstreamOpen.length,
        imported: 0,
        complete: true,
      });
      continue;
    }

    const have = new Set(members.map((m) => String(m.polymarket_id)));
    const ranked = [...upstreamOpen].sort((a, b) => vol(b) - vol(a));
    const target = ranked.slice(0, MAX_PER_GROUP);
    const missing = target.filter((m) => m.id != null && !have.has(String(m.id)));

    const categoryId = members.find((m) => m.category_id)?.category_id ?? null;
    let added = 0;

    for (const m of missing) {
      if (budget <= 0) break;
      const iso = closesAt(m);
      if (!m.question || !iso || new Date(iso).getTime() <= Date.now() + 60_000) continue;
      const pools = seedPools(parseYesProbability(m));
      const row = {
        creator_id: null,
        title: m.question,
        description: buildImportedDescription(
          m.description ?? "Imported from Polymarket.",
          m.outcomes,
        ),
        category_id: categoryId,
        closes_at: iso,
        status: "open" as const,
        yes_pool: pools.yes_pool,
        no_pool: pools.no_pool,
        volume: vol(m),
        source: "polymarket",
        polymarket_id: String(m.id),
        polymarket_clob_token_id: yesClobTokenId(m),
        created_via: "polymarket_import" as const,
        polymarket_event_id: String(ev.id ?? eventId),
        polymarket_event_slug: ev.slug ?? null,
        polymarket_event_title: ev.title ?? null,
        polymarket_neg_risk_id: m.negRiskMarketID ? String(m.negRiskMarketID) : null,
        group_item_title: m.groupItemTitle?.trim() || null,
        event_mutually_exclusive: true,
        upstream_outcome_count: upstreamOpen.length,
      };
      const { data, error } = await supabaseAdmin
        .from("markets")
        .insert(row)
        .select("id, yes_pool, no_pool");
      if (error) {
        if (error.code === "23505") continue; // already imported concurrently
        console.error("[group-complete] insert failed", m.id, error.message);
        continue;
      }
      added++;
      budget--;
      const newId = data?.[0]?.id as string | undefined;
      if (newId) {
        await supabaseAdmin.from("price_history").insert({
          market_id: newId,
          yes_price: Number(data[0].no_pool) / (Number(data[0].yes_pool) + Number(data[0].no_pool)),
        });
        if (row.polymarket_clob_token_id) {
          try {
            await backfillMarketHistory(supabaseAdmin, newId);
          } catch (e) {
            console.error("[group-complete] history backfill failed", newId, (e as Error).message);
          }
          await new Promise((r) => setTimeout(r, THROTTLE_MS));
        }
      }
    }

    // Keep the whole group's labelling honest, including rows imported earlier.
    await supabaseAdmin
      .from("markets")
      .update({ event_mutually_exclusive: true, upstream_outcome_count: upstreamOpen.length })
      .in("id", memberIds);

    imported += added;
    const nowHave = members.length + added;
    results.push({
      eventId,
      title,
      mutuallyExclusive: true,
      before: members.length,
      upstream: upstreamOpen.length,
      imported: added,
      complete: nowHave >= upstreamOpen.length,
    });
  }

  return { imported, events: results };
}
