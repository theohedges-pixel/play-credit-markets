import { Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { highestTier, tierLabel, tierStyle } from "@/lib/milestones";

/**
 * Small permanent badge showing the highest lifetime wealth tier an account has
 * ever reached. Renders nothing below the first tier so it never adds noise.
 */
export function TierBadge({
  peakNetWorth,
  size = "sm",
  className,
}: {
  peakNetWorth: number | string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const tier = highestTier(peakNetWorth);
  if (!tier) return null;
  const style = tierStyle(tier);
  return (
    <span
      title={`Lifetime peak net worth: ${tierLabel(tier)}+ credits`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-mono leading-none shrink-0",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        style.className,
        style.glow && "shadow-[0_0_12px_-2px_currentColor]",
        className,
      )}
    >
      <Gem size={size === "sm" ? 10 : 12} />
      {tierLabel(tier)}
    </span>
  );
}
