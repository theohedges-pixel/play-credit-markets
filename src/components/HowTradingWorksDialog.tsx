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

export function HowTradingWorksDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="How trading works"
        >
          <CircleHelp className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl">How Predikt works</DialogTitle>
          <DialogDescription className="sr-only">
            An explanation of how buying and selling YES and NO shares works.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm leading-relaxed text-foreground">
          <p>Every question here has two sides: YES and NO.</p>
          <p>
            The price you see (like 62¢) shows what people currently think the chances are. 62¢ means people
            think it's about 62% likely to happen.
          </p>
          <div className="space-y-1">
            <p>
              <span className="font-semibold text-yes">Buying YES</span> means you think it WILL happen.
            </p>
            <p>
              <span className="font-semibold text-no">Buying NO</span> means you think it WON'T happen.
            </p>
          </div>
          <p>
            Here's the important part: if you're right, every share you own pays out{" "}
            <span className="font-semibold">100¢ — a whole credit</span> — no matter what you paid for it.
          </p>
          <div className="rounded-md border border-border bg-secondary/40 p-4 space-y-2">
            <p className="font-semibold">Example: You buy a YES share for 62¢.</p>
            <ul className="list-disc list-outside pl-5 space-y-1 text-muted-foreground">
              <li>
                If YES happens: you get 100¢ back. That's <span className="text-yes font-semibold">38¢ of profit</span>!
              </li>
              <li>
                If NO happens: your share is worth 0¢, and you <span className="text-no font-semibold">lose the 62¢</span> you
                paid.
              </li>
            </ul>
          </div>
          <p>
            You don't have to wait for the answer. You can sell your shares any time before the question closes —
            locking in a win early, or getting out if you've changed your mind.
          </p>
          <p className="text-muted-foreground">
            Prices move as people trade. If lots of people buy YES, the YES price goes up — because more people now
            think it's likely.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
