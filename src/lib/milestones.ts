// Lifetime wealth milestones. Tiers must stay in sync with the SQL helper
// public.milestone_tiers() — the database decides when one is earned.
export const MILESTONE_TIERS = [
  5_000, 10_000, 50_000, 250_000, 500_000, 1_000_000, 5_000_000, 25_000_000,
  50_000_000, 100_000_000, 500_000_000, 1_000_000_000,
] as const;

export type MilestoneTier = (typeof MILESTONE_TIERS)[number];

export const tierLabel = (tier: number) => {
  if (tier >= 1_000_000_000) return `${tier / 1_000_000_000}B`;
  if (tier >= 1_000_000) return `${tier / 1_000_000}M`;
  return `${tier / 1_000}K`;
};

/** Highest tier a peak net worth has earned, or null below the first tier. */
export const highestTier = (peak: number | string | null | undefined) => {
  const n = Number(peak ?? 0);
  let earned: number | null = null;
  for (const t of MILESTONE_TIERS) if (n >= t) earned = t;
  return earned;
};

export const nextTier = (peak: number | string | null | undefined) => {
  const n = Number(peak ?? 0);
  return MILESTONE_TIERS.find((t) => n < t) ?? null;
};

/** Colour graduation: restrained at the low end, luminous at the top. */
export const tierStyle = (tier: number) => {
  const i = MILESTONE_TIERS.indexOf(tier as MilestoneTier);
  if (i < 0) return { className: "text-muted-foreground border-border", glow: false };
  if (i <= 1) return { className: "text-muted-foreground border-border", glow: false };
  if (i <= 3) return { className: "text-sky-300 border-sky-400/40 bg-sky-400/10", glow: false };
  if (i <= 5) return { className: "text-primary border-primary/40 bg-primary/10", glow: false };
  if (i <= 7) return { className: "text-violet-300 border-violet-400/50 bg-violet-400/10", glow: true };
  if (i <= 9) return { className: "text-amber-300 border-amber-400/50 bg-amber-400/10", glow: true };
  return { className: "text-rose-300 border-rose-400/60 bg-rose-400/10", glow: true };
};
