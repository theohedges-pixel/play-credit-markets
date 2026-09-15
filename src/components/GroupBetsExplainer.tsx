import { CircleHelp, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function GroupBetsExplainerDialog({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className ?? "h-8 w-8 text-muted-foreground hover:text-foreground"}
          aria-label="How group bets work"
        >
          <CircleHelp className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl">How group bets work</DialogTitle>
          <DialogDescription className="sr-only">
            An explanation of group bets, how to create one, join one, and how they resolve.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm leading-relaxed text-foreground">
          <GroupBetsExplainerContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GroupBetsExplainerCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Bet with friends</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Group bets let you and your friends wager on anything with a YES or NO answer.
          </p>
        </div>
      </div>
      <GroupBetsExplainerContent />
    </div>
  );
}

function GroupBetsExplainerContent() {
  return (
    <>
      <p>
        A group bet is a friendly wager between you and other people on Predikt. You pick a question
        with a YES or NO answer — like{" "}
        <span className="italic">
          "Lakeside School will beat Holyoak High in the Football Game on Friday"
        </span>{" "}
        — and everyone puts in the same stake. When the result is known, the group votes on what
        happened and the winners split the pot.
      </p>

      <div className="space-y-2">
        <p className="font-semibold">How to start one</p>
        <ol className="list-decimal list-outside pl-5 space-y-1 text-muted-foreground">
          <li>Tap <strong>New bet</strong>.</li>
          <li>Write a clear YES/NO question and pick a close date.</li>
          <li>Set the <strong>stake per person</strong>. Everyone who joins — including you — wagers exactly that amount.</li>
          <li>Invite friends from your friend list or share the invite link.</li>
          <li>Once enough people have joined, the bet is on.</li>
        </ol>
      </div>

      <div className="space-y-2">
        <p className="font-semibold">How joining works</p>
        <p className="text-muted-foreground">
          If someone invites you, tap the link or find the bet in your list. You will stake the same
          amount as everyone else — the creator chooses it upfront, so nobody can buy in for more or
          less.
        </p>
      </div>

      <div className="space-y-2">
        <p className="font-semibold">How it resolves</p>
        <p className="text-muted-foreground">
          After the close date, any participant can propose the outcome and give a reason. Everyone
          then has <strong>48 hours</strong> to vote YES, NO, or Invalid.
        </p>
        <ul className="list-disc list-outside pl-5 space-y-1 text-muted-foreground">
          <li>If everyone who votes agrees, the bet settles immediately and winners are paid.</li>
          <li>After 48 hours, the outcome chosen by the majority of voters wins.</li>
          <li>If nobody votes, or the vote is tied, everyone gets their stake back.</li>
        </ul>
      </div>

      <hr className="border-border" />

      <div className="space-y-2 text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">A few things to keep in mind</span>
        </p>
        <ul className="list-disc list-outside pl-5 space-y-1">
          <li>Group bets use Predikt credits only — never real money.</li>
          <li>Make the question checkable. Link to a result source if you can.</li>
          <li>If the question itself was flawed, vote <strong>Invalid</strong> and everyone gets refunded.</li>
        </ul>
      </div>
    </>
  );
}
