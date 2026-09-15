import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtCredits, fmtPct, yesPrice } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LedgerTrade } from "@/components/TradeRow";

/**
 * Sell dialog opened from a "Sell now" button in the trade ledger. Sells some
 * or all of the tokens held on the trade's side, quoting against the market's
 * live pools with the same constant-product math as the market page.
 */
export function SellTradeDialog({
  trade,
  open,
  onOpenChange,
}: {
  trade: LedgerTrade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { user, refreshProfile } = useAuth();
  const [shares, setShares] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: market } = useQuery({
    queryKey: ["sell-dialog-market", trade?.market_id],
    enabled: open && !!trade,
    queryFn: async () => {
      const { data } = await supabase
        .from("markets")
        .select("id, title, status, yes_pool, no_pool")
        .eq("id", trade!.market_id)
        .single();
      return data;
    },
  });

  const { data: position } = useQuery({
    queryKey: ["sell-dialog-position", trade?.market_id, user?.id],
    enabled: open && !!trade && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("positions")
        .select("yes_shares, no_shares")
        .eq("market_id", trade!.market_id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Reset the amount each time a different trade is sold.
  useEffect(() => {
    if (open && trade) setShares(String(Math.floor(Number(trade.shares) * 100) / 100));
  }, [open, trade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trade) return null;

  const side = trade.side;
  const held = position
    ? Number(side === "yes" ? position.yes_shares : position.no_shares)
    : 0;
  const yesPool = market ? Number(market.yes_pool) : 0;
  const noPool = market ? Number(market.no_pool) : 0;
  const ownPool = side === "yes" ? yesPool : noPool;
  const otherPool = side === "yes" ? noPool : yesPool;

  const sharesNum = Number(shares);
  const validAmount = Number.isFinite(sharesNum) && sharesNum > 0;
  const overHeld = validAmount && sharesNum > held;

  // Mirrors the RPC / market-page sell quote.
  const quoteSell = (s: number) => {
    const b = ownPool + s + otherPool;
    const disc = b * b - 4 * s * otherPool;
    if (disc < 0) return 0;
    return Math.round(((b - Math.sqrt(disc)) / 2) * 100) / 100;
  };
  const proceeds = validAmount && !overHeld && market ? quoteSell(sharesNum) : 0;
  const avgPrice = validAmount && proceeds > 0 ? proceeds / sharesNum : null;

  // Price after the sale (same update as the RPC).
  const currentYes = market ? yesPrice(yesPool, noPool) : null;
  const resultingYes = (() => {
    if (!market || !validAmount || proceeds <= 0) return currentYes;
    const newOwn = ownPool + sharesNum - proceeds;
    const newOther = otherPool - proceeds;
    return side === "yes" ? yesPrice(newOwn, newOther) : yesPrice(newOther, newOwn);
  })();

  const sell = async () => {
    if (!user) return;
    if (!validAmount) { toast.error("Enter a number of tokens"); return; }
    if (overHeld) { toast.error("You don't hold that many tokens"); return; }
    if (market?.status !== "open") { toast.error("This market is no longer trading"); return; }
    setSubmitting(true);
    const res = await (supabase as any).rpc("sell_shares", {
      p_market_id: trade.market_id,
      p_side: side,
      p_shares: sharesNum,
    });
    setSubmitting(false);
    if (res.error) { toast.error(res.error.message); return; }
    const result = res.data as { error?: string; shares?: number; proceeds?: number };
    if (result?.error) { toast.error(result.error); return; }
    toast.success(
      `Sold ${Number(result.shares)} ${side.toUpperCase()} tokens for ${fmtCredits(result.proceeds ?? 0)} credits.`,
    );
    onOpenChange(false);
    refreshProfile();
    qc.invalidateQueries({ queryKey: ["public-trading-history"] });
    qc.invalidateQueries({ queryKey: ["positions", user.id] });
    qc.invalidateQueries({ queryKey: ["net-worth", user.id] });
    qc.invalidateQueries({ queryKey: ["market", trade.market_id] });
    qc.invalidateQueries({ queryKey: ["market-activity", trade.market_id] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Sell {side.toUpperCase()} tokens</DialogTitle>
          <DialogDescription className="line-clamp-2">{trade.market_title ?? "This market"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">You hold</span>
              <span className="font-mono tabular-nums">{held.toFixed(2)} {side.toUpperCase()} tokens</span>
            </div>
            {currentYes != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current price</span>
                <span className="font-mono tabular-nums">
                  {fmtPct(side === "yes" ? currentYes : 1 - currentYes)} per token
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="sell-shares" className="text-xs text-muted-foreground">Tokens to sell</label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShares(String(Math.floor(held * 100) / 100))}
              >
                Max
              </button>
            </div>
            <Input
              id="sell-shares"
              type="number"
              min="0"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
            />
            {overHeld && (
              <p className="mt-1 text-xs text-no">You only hold {held.toFixed(2)} {side.toUpperCase()} tokens.</p>
            )}
          </div>

          {validAmount && !overHeld && market && (
            <div className="rounded-md border border-border p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-mono tabular-nums font-semibold">{fmtCredits(proceeds)}c</span>
              </div>
              {avgPrice != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average price</span>
                  <span className="font-mono tabular-nums">{fmtPct(avgPrice)} per token</span>
                </div>
              )}
              {currentYes != null && resultingYes != null && Math.abs(resultingYes - currentYes) > 0.0001 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price moves to</span>
                  <span className="font-mono tabular-nums">{fmtPct(side === "yes" ? resultingYes : 1 - resultingYes)}</span>
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={sell}
            disabled={submitting || !validAmount || overHeld || !market || market.status !== "open" || held <= 0}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : validAmount && !overHeld ? `Sell for ${fmtCredits(proceeds)}c` : "Sell now"}
          </Button>
          {market && market.status !== "open" && (
            <p className="text-xs text-muted-foreground text-center">This market is no longer trading.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
