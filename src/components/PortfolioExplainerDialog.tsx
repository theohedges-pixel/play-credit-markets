import { CircleHelp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function PortfolioExplainerDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 -mr-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Understanding your portfolio"
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl">Understanding your portfolio</DialogTitle>
          <DialogDescription className="sr-only">
            An explanation of how net worth, cash, position value, and P&amp;L are calculated.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm leading-relaxed text-foreground">
          <div className="space-y-2">
            <p>
              <span className="font-semibold">Net worth</span> is everything you have — your cash plus what your open positions are currently worth. It's the number the leaderboard ranks you by, and the one to watch if you want a single figure.
            </p>
            <p>
              <span className="font-semibold">Cash</span> is credits sitting free, ready to trade with.
            </p>
            <p>
              <span className="font-semibold">Position value</span> is what your open positions would be worth if you sold them all right now. It moves whenever prices move, even when you're doing nothing.
            </p>
          </div>

          <hr className="border-border" />

          <div className="space-y-2">
            <p>
              <span className="font-semibold">Unrealized P&amp;L</span> is profit or loss on positions you still hold. It's not locked in — it changes with every price move, and it isn't yours until you sell or the market resolves.
            </p>
            <p>
              <span className="font-semibold">Realized P&amp;L</span> is profit or loss that's already settled. Money from shares you sold, and from markets that have resolved. This can't change.
            </p>
            <p>
              <span className="font-semibold">Total P&amp;L</span> is the two added together — your overall result since you started.
            </p>
          </div>

          <hr className="border-border" />

          <div className="space-y-2">
            <p>
              <span className="font-semibold">Your trades</span> lists every buy and sell, newest first.
            </p>
            <p>
              <span className="font-semibold">Open</span> means you still hold those shares and the market is still trading. The gain shown is what you'd make if you sold right now — it'll keep moving.
            </p>
            <p>
              <span className="font-semibold">Closed</span> means it's finished, either because you sold or because the market resolved. That gain is final.
            </p>
          </div>

          <hr className="border-border" />

          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">One thing that trips people up:</span> a resolved market pays out into your cash, and its position stops counting toward position value. So when a market you've won resolves, your position value drops while your cash rises. That's not a loss — the money just moved from one column to the other.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
