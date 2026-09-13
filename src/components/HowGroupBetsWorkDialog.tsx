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

export function HowGroupBetsWorkDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="How group bets work"
        >
          <CircleHelp className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl">How group bets work</DialogTitle>
          <DialogDescription className="sr-only">
            An explanation of how pari-mutuel group bets work on Predikt.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm leading-relaxed text-foreground">
          <p>
            Group bets work differently from the markets on Predikt. There's no price and no shares — everyone's
            wagers go into one pot.
          </p>
          <p>
            <span className="font-semibold">Pick a side, put credits on it.</span> YES or NO. That's your wager.
          </p>
          <p>
            <span className="font-semibold">Everyone's credits go into the same pot.</span> Both sides, all mixed
            together.
          </p>
          <p>
            <span className="font-semibold">The winning side splits the whole pot.</span> You get a share based on
            how much you put in compared to the others who were right.
          </p>
          <div className="rounded-md border border-border bg-secondary/40 p-4">
            <p className="font-semibold">Example:</p>
            <p className="text-muted-foreground mt-1">
              The pot is $100 — $75 on YES, $25 on NO. NO turns out to be right. The three people who bet NO split
              all $100 between them, in proportion to what each put in. Someone who staked $10 of that $25 gets $40
              back.
            </p>
          </div>
          <p>
            <span className="font-semibold">This means the unpopular side pays more.</span> If almost everyone bets
            YES and NO wins, the few NO backers split a big pot between very few people. That's why the percentages
            matter — they show you what the group thinks, and what each side pays if it's right.
          </p>
          <div className="space-y-1">
            <p className="font-semibold">Two things to know:</p>
            <ul className="list-disc list-outside pl-5 space-y-1 text-muted-foreground">
              <li>Your exact payout isn't fixed when you bet. It depends on how everyone else wagers after you.</li>
              <li>You can't cash out early. Once you're in, you're in until the bet is settled.</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
