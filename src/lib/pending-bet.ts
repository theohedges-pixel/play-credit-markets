import { supabase } from "@/integrations/supabase/client";

const KEY = "predikt-pending-bet";

export interface PendingBet {
  betId: string;
  sharer: string;
}

export function setPendingBet(p: PendingBet) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function getPendingBet(): PendingBet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p?.betId && p?.sharer ? (p as PendingBet) : null;
  } catch {
    return null;
  }
}

export function clearPendingBet() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Accepts a shared group-bet link for the signed-in user: forms the friendship
 * with the sharer and creates the invite row. Idempotent.
 */
export async function joinViaLink(betId: string, sharer: string): Promise<string | null> {
  const { error } = await (supabase as any).rpc("join_group_bet_via_link", {
    _group_bet_id: betId,
    _sharer_username: sharer,
  });
  return error ? error.message : null;
}
