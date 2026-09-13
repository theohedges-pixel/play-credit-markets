/**
 * Rewrites Polymarket's own market description into Predikt's terms.
 *
 * Two things Polymarket's text gets wrong for us:
 *  1. Many markets are framed around two NAMED outcomes ("resolves to
 *     'Los Angeles Dodgers'"), but Predikt only has YES/NO shares. The first
 *     Gamma outcome is always the one we seed as YES (see seedPools: the YES
 *     price equals outcomePrices[0]), so we state that mapping explicitly.
 *  2. Its resolution paragraph describes Polymarket's OWN verification
 *     process. Predikt does not verify anything independently — it mirrors
 *     Polymarket's settled outcome. We replace that paragraph with the truth.
 */

export const PREDIKT_RESOLUTION_NOTE =
  "How this resolves on Predikt: this market mirrors Polymarket. Once Polymarket settles the corresponding real-world market, Predikt automatically resolves this market to the same outcome — Predikt does not verify results independently. If Polymarket voids the market or settles it 50-50, an admin resolves it here as invalid and all wagered credits are returned.";

const SOURCE_LINE = "Source: Polymarket";

/** Parses Gamma's outcomes field, which is a JSON string array (sometimes already parsed). */
export function parseOutcomes(raw: unknown): string[] | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v)) return null;
  const arr = v.map((x) => String(x).trim()).filter(Boolean);
  return arr.length >= 2 ? arr.slice(0, 2) : null;
}

/** True when the two outcomes are named things (teams, candidates) rather than plain Yes/No. */
export function isNamedOutcomePair(outcomes: string[] | null): boolean {
  if (!outcomes) return false;
  const plain = new Set(["yes", "no"]);
  return !outcomes.every((o) => plain.has(o.toLowerCase()));
}

const RESOLVE_TO_LINE = /(^|\n)[^\n]*resolve[sd]?\s+to\s+["“][^"”]+["”][^\n]*/gi;
const POLY_CRITERIA = /(^|\n)[^\n]*(primary resolution source|consensus of credible reporting|resolution source for this market)[^\n]*/gi;

function outcomeClause(description: string, outcome: string): string | null {
  const esc = outcome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Capture to end of line, not to the first period — team names such as
  // "St. Louis Cardinals" contain periods.
  const re = new RegExp(`resolve[sd]?\\s+to\\s+["“]${esc}["”]\\s+if\\s+([^\\n]+)`, "i");
  const m = description.match(re);
  const clause = m?.[1]?.trim().replace(/[.\s]+$/, "") ?? "";
  if (!clause || clause.length > 160) return null;
  return clause;
}

/**
 * Builds the description Predikt stores for an imported market.
 * Safe for native Yes/No markets too: they just get the resolution note.
 */
export function buildImportedDescription(
  polyDescription: string | null | undefined,
  outcomesRaw: unknown,
): string {
  const original = (polyDescription ?? "").replace(/\n\nSource: Polymarket\s*$/i, "").trim();
  const outcomes = parseOutcomes(outcomesRaw);
  const named = isNamedOutcomePair(outcomes);

  let header = "";
  if (named && outcomes) {
    const [a, b] = outcomes as [string, string];
    const ca = outcomeClause(original, a);
    const cb = outcomeClause(original, b);
    header =
      ca && cb
        ? `YES = ${ca}. NO = ${cb}.`
        : `YES = ${a}. NO = ${b}.`;
  }

  let body = original;
  if (named) body = body.replace(RESOLVE_TO_LINE, "");
  body = body
    .replace(POLY_CRITERIA, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return [header, body, PREDIKT_RESOLUTION_NOTE, SOURCE_LINE]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);
}
