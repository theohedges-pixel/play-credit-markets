import { supabase } from "@/integrations/supabase/client";

/**
 * Ask the user to confirm blocking someone, disclosing any open group bets
 * they already share. Existing bets are never dissolved: wagered credits are
 * real and resolution needs every participant's vote, so we say so plainly
 * instead of silently doing less than the user expects.
 */
export async function confirmBlock(userId: string, username: string): Promise<boolean> {
  let shared = 0;
  try {
    const { data } = await (supabase as any).rpc("shared_open_group_bets", { _user_id: userId });
    shared = typeof data === "number" ? data : 0;
  } catch {
    shared = 0;
  }

  const lines = [`Block @${username}? They won't be able to send you requests or group-bet invites.`];
  if (shared > 0) {
    lines.push(
      "",
      `You share ${shared} open bet${shared === 1 ? "" : "s"} with this person. They'll still see your name and wagers there until ${shared === 1 ? "it resolves" : "those bets resolve"}.`,
    );
  }
  return window.confirm(lines.join("\n"));
}
