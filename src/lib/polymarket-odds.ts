/**
 * Shared pool seeding for Polymarket imports.
 * Keeps the same liquidity budget as the AI market generator so every
 * creation path prices markets consistently.
 */
export const TOTAL_LIQUIDITY = 2000;
export const MIN_POOL = 50;

export interface PolyOddsFields {
  /** Gamma returns this as a JSON string array, e.g. '["0.67","0.33"]' (sometimes already parsed). */
  outcomePrices?: string | string[] | null;
  lastTradePrice?: number | string | null;
  bestBid?: number | string | null;
  bestAsk?: number | string | null;
}

const asNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Best available market-implied YES probability, or null when nothing usable is present.
 * Priority: outcomePrices[0] -> lastTradePrice -> bid/ask midpoint.
 */
export function parseYesProbability(m: PolyOddsFields): number | null {
  const candidates: (number | null)[] = [];

  let prices: unknown = m.outcomePrices;
  if (typeof prices === "string") {
    try {
      prices = JSON.parse(prices);
    } catch {
      prices = null;
    }
  }
  if (Array.isArray(prices) && prices.length >= 1) candidates.push(asNum(prices[0]));

  candidates.push(asNum(m.lastTradePrice));

  const bid = asNum(m.bestBid);
  const ask = asNum(m.bestAsk);
  if (bid !== null && ask !== null) candidates.push((bid + ask) / 2);

  for (const p of candidates) {
    if (p !== null && p > 0 && p < 1) return p;
  }
  return null;
}

/**
 * Upper bound on seeded liquidity. Lets us price a 0.1% long shot honestly
 * while keeping the thin side of the book at MIN_POOL.
 */
export const MAX_LIQUIDITY = 50_000;

/**
 * Pools seeded from a probability; neutral 1000/1000 when the probability is unknown.
 *
 * A flat 2,000-credit budget with a 50-credit floor cannot express anything
 * below 2.5% — every long shot in a 50-way field collapsed onto the same 2c.
 * Instead of lowering the floor (which leaves the thin side so shallow that a
 * single small trade swings the price to the cap), we scale total liquidity up
 * so the ratio survives: total = MIN_POOL / p for small p. The price is exact,
 * the thin side still holds MIN_POOL credits of depth, and the deep side just
 * takes more volume to move — which is correct for a 0.5% candidate.
 */
export function seedPools(p: number | null): { yes_pool: number; no_pool: number } {
  if (p === null) return { yes_pool: 1000, no_pool: 1000 };
  const thin = Math.min(p, 1 - p);
  const total = Math.min(
    MAX_LIQUIDITY,
    Math.max(TOTAL_LIQUIDITY, thin > 0 ? MIN_POOL / thin : TOTAL_LIQUIDITY),
  );
  let yes_pool = Math.round(total * (1 - p));
  let no_pool = Math.round(total * p);
  if (yes_pool < MIN_POOL) yes_pool = MIN_POOL;
  if (no_pool < MIN_POOL) no_pool = MIN_POOL;
  return { yes_pool, no_pool };
}
