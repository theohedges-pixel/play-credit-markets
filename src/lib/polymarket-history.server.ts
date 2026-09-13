/**
 * Historical price backfill from Polymarket's CLOB API.
 *
 * The CLOB `/prices-history` endpoint is keyed by CLOB *token* id (the YES
 * outcome token), not by the Gamma market/condition id we already store — the
 * token id comes from Gamma's `clobTokenIds` field on the same response we
 * already fetch at import time.
 *
 * Safety boundary (identical to the odds-refresh feature): we only ever touch
 * markets created via `polymarket_import` that have ZERO Predikt trades. Once
 * a single real trade exists, the price series belongs to our own CPMM and is
 * never augmented with external data.
 *
 * Known upstream limitation: for resolved/closed markets Polymarket often only
 * returns coarse (12h+) granularity even where finer data existed live. That's
 * an API constraint, not an integration bug — we backfill whatever the series
 * contains rather than erroring or skipping the market.
 *
 * Rate limits: Polymarket does not publish a numeric limit for this public
 * read endpoint (it is Cloudflare-fronted and cached for ~90s). We therefore
 * self-throttle conservatively — one request at a time with a delay between
 * markets, plus a bounded retry on 429/5xx.
 */

const HISTORY_URL = "https://clob.polymarket.com/prices-history";

/** Delay between markets in a multi-market backfill run. */
export const THROTTLE_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HistoryPoint {
  /** Unix seconds. */
  t: number;
  /** YES probability, 0..1 */
  p: number;
}

/** Extract the YES-outcome CLOB token id from a Gamma market payload. */
export function yesClobTokenId(m: {
  clobTokenIds?: string | string[] | null;
}): string | null {
  const raw = m?.clobTokenIds;
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const first = String(arr[0] ?? "").trim();
  return first.length ? first : null;
}

/**
 * Fetch the widest available price series for a CLOB token.
 * Returns [] when the endpoint has no data for this token.
 */
export async function fetchPriceHistory(tokenId: string): Promise<HistoryPoint[]> {
  const url = `${HISTORY_URL}?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=60`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 2) throw new Error(`prices-history ${res.status}`);
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`prices-history ${res.status}`);
    const body = (await res.json()) as { history?: HistoryPoint[] };
    const hist = Array.isArray(body?.history) ? body.history : [];
    return hist
      .filter(
        (h) =>
          Number.isFinite(Number(h?.t)) &&
          Number.isFinite(Number(h?.p)) &&
          Number(h.p) >= 0 &&
          Number(h.p) <= 1,
      )
      .map((h) => ({ t: Number(h.t), p: Number(h.p) }));
  }
  return [];
}

export interface BackfillResult {
  marketId: string;
  status: "inserted" | "skipped";
  reason?: string;
  points: number;
  /** Number of points the upstream series contained. */
  fetched: number;
  sparse?: boolean;
  firstAt?: string;
  lastAt?: string;
}

/**
 * Backfill pre-import Polymarket price history for a single market.
 * Only inserts points strictly BEFORE the market's Predikt import time, so it
 * never duplicates points recorded by our own periodic odds refresh.
 */
export async function backfillMarketHistory(
  supabaseAdmin: any,
  marketId: string,
): Promise<BackfillResult> {
  const base: BackfillResult = { marketId, status: "skipped", points: 0, fetched: 0 };

  const { data: market, error: mErr } = await supabaseAdmin
    .from("markets")
    .select("id, created_at, created_via, polymarket_clob_token_id")
    .eq("id", marketId)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!market) return { ...base, reason: "market not found" };
  if (market.created_via !== "polymarket_import")
    return { ...base, reason: "not a Polymarket import" };
  if (!market.polymarket_clob_token_id)
    return { ...base, reason: "no CLOB token id stored" };

  // Hard safety check, re-verified immediately before writing.
  const { count: tradeCount, error: tErr } = await supabaseAdmin
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("market_id", marketId);
  if (tErr) throw new Error(tErr.message);
  if ((tradeCount ?? 0) > 0) return { ...base, reason: "market has Predikt trades" };

  const importedAt = new Date(market.created_at).getTime();

  const series = await fetchPriceHistory(market.polymarket_clob_token_id);
  const preImport = series.filter((h) => h.t * 1000 < importedAt);
  if (preImport.length === 0)
    return { ...base, fetched: series.length, reason: "no pre-import history available" };

  // Don't re-insert points already backfilled.
  const { data: existing } = await supabaseAdmin
    .from("price_history")
    .select("recorded_at")
    .eq("market_id", marketId)
    .lt("recorded_at", new Date(importedAt).toISOString());
  const seen = new Set(
    (existing ?? []).map((r: { recorded_at: string }) => new Date(r.recorded_at).getTime()),
  );

  const rows = preImport
    .map((h) => ({ ms: h.t * 1000, p: h.p }))
    .filter((r) => !seen.has(r.ms))
    .map((r) => ({
      market_id: marketId,
      yes_price: r.p,
      recorded_at: new Date(r.ms).toISOString(),
    }));

  if (rows.length === 0)
    return { ...base, fetched: series.length, reason: "already backfilled" };

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from("price_history").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  // Sparse = average gap over 6h, the signature of the coarse-granularity
  // series Polymarket returns for closed markets.
  const span = preImport[preImport.length - 1]!.t - preImport[0]!.t;
  const sparse = preImport.length > 1 && span / (preImport.length - 1) > 6 * 3600;

  return {
    marketId,
    status: "inserted",
    points: rows.length,
    fetched: series.length,
    sparse,
    firstAt: rows[0]!.recorded_at,
    lastAt: rows[rows.length - 1]!.recorded_at,
  };
}

/**
 * One-time backfill across existing untraded Polymarket imports.
 * Throttled; returns a per-market report.
 */
export async function backfillAllPolymarketHistory(
  supabaseAdmin: any,
  limit = 40,
): Promise<{ scanned: number; backfilled: number; points: number; sparse: number; results: BackfillResult[] }> {
  const { data: candidates, error } = await supabaseAdmin
    .from("markets")
    .select("id, created_at")
    .eq("created_via", "polymarket_import")
    .not("polymarket_clob_token_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const ids = (candidates ?? []).map((m: { id: string }) => m.id);
  const traded = new Set<string>();
  if (ids.length) {
    const { data: tradeRows } = await supabaseAdmin
      .from("trades")
      .select("market_id")
      .in("market_id", ids);
    for (const t of tradeRows ?? []) traded.add(t.market_id);
  }

  const results: BackfillResult[] = [];
  let backfilled = 0;
  let points = 0;
  let sparse = 0;
  for (const id of ids) {
    if (traded.has(id)) continue;
    try {
      const r = await backfillMarketHistory(supabaseAdmin, id);
      results.push(r);
      if (r.status === "inserted") {
        backfilled++;
        points += r.points;
        if (r.sparse) sparse++;
      }
    } catch (e) {
      results.push({
        marketId: id,
        status: "skipped",
        points: 0,
        fetched: 0,
        reason: (e as Error).message,
      });
    }
    await sleep(THROTTLE_MS);
  }

  return { scanned: ids.length, backfilled, points, sparse, results };
}
