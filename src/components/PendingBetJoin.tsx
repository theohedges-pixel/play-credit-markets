import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { clearPendingBet, getPendingBet, joinViaLink } from "@/lib/pending-bet";

/**
 * Once a user is authenticated, redeem any group-bet share link they arrived
 * with (signup via /join/$username?bet=... or sign-in on the same link) and
 * drop them on the bet page ready to wager.
 */
export function PendingBetJoin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const running = useRef(false);

  useEffect(() => {
    if (!user || running.current) return;
    const pending = getPendingBet();
    if (!pending) return;
    running.current = true;
    (async () => {
      const err = await joinViaLink(pending.betId, pending.sharer);
      clearPendingBet();
      if (err) {
        toast.error(err);
        running.current = false;
        return;
      }
      toast.success("You've been added to the bet");
      await navigate({ to: "/group-bets/$id", params: { id: pending.betId } });
      running.current = false;
    })();
  }, [user, navigate]);

  return null;
}
