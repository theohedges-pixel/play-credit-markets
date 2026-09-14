import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy } from "lucide-react";
import { toast } from "sonner";

const REFERRAL_REWARD = 10;
const REFERRAL_BONUS_EVERY = 20;
const REFERRAL_BONUS = 100;

export function InviteFriends() {
  const { user, profile } = useAuth();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const link = profile?.username && origin ? `${origin}/join/${profile.username}` : "";

  const { data: stats } = useQuery({
    queryKey: ["referral-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("referrals")
        .select("reward_credited")
        .eq("referrer_id", user!.id);
      const rows = (data as { reward_credited: boolean }[] | null) ?? [];
      const confirmed = rows.filter((r) => r.reward_credited).length;
      return { joined: rows.length, confirmed, earned: confirmed * REFERRAL_REWARD };
    },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Predikt",
          text: "Join me on Predikt — free prediction markets, no real money",
          url: link,
        });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    await copy();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold">Invite friends</h2>
          <p className="text-sm text-muted-foreground mt-1">
            They start with 1,250 credits. You earn {REFERRAL_REWARD} credits once they confirm
            their email.
          </p>
        </div>
        <Button onClick={share} disabled={!link} className="gap-2">
          <Share2 className="w-4 h-4" />
          Share my link
        </Button>
      </div>

      <div className="flex gap-2 mt-4">
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button variant="secondary" onClick={copy} disabled={!link} className="gap-2 shrink-0">
          <Copy className="w-4 h-4" />
          Copy
        </Button>
      </div>

      <div className="flex gap-6 mt-4 pt-4 border-t border-border text-sm">
        <div>
          <div className="font-display text-xl font-bold tabular-nums">{stats?.confirmed ?? 0}</div>
          <div className="text-xs text-muted-foreground">friends joined</div>
        </div>
        <div>
          <div className="font-display text-xl font-bold tabular-nums">
            {(stats?.earned ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">credits earned</div>
        </div>
        {stats && stats.joined > stats.confirmed && (
          <div>
            <div className="font-display text-xl font-bold tabular-nums text-muted-foreground">
              {stats.joined - stats.confirmed}
            </div>
            <div className="text-xs text-muted-foreground">awaiting email confirmation</div>
          </div>
        )}
      </div>
    </div>
  );
}
