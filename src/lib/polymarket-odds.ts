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

/** Pools seeded from a probability; neutral 1000/1000 when the probability is unknown. */
export function seedPools(p: number | null): { yes_pool: number; no_pool: number } {
  if (p === null) return { yes_pool: 1000, no_pool: 1000 };
  let yes_pool = Math.round(TOTAL_LIQUIDITY * (1 - p));
  let no_pool = Math.round(TOTAL_LIQUIDITY * p);
  if (yes_pool < MIN_POOL) yes_pool = MIN_POOL;
  if (no_pool < MIN_POOL) no_pool = MIN_POOL;
  return { yes_pool, no_pool };
}
