import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public lookup of an inviter's display info by username.
 * Uses the admin client server-side because `profiles` is not readable by anon,
 * and returns only non-sensitive display fields.
 */
export const getInviter = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ username: z.string().min(1).max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!username) return null;
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("username", username)
      .maybeSingle();
    return (row as { id: string; username: string; avatar_url: string | null } | null) ?? null;
  });

export interface GroupBetPreview {
  id: string;
  title: string;
  description: string | null;
  closes_at: string;
  creator_username: string;
}

/**
 * Narrow public preview of an OPEN group bet, for shared links.
 * Backed by a SECURITY DEFINER RPC that returns nothing for closed/resolved bets.
 */
export const getGroupBetPreview = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ betId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows } = await client.rpc("get_public_group_bet_preview" as any, {
      _group_bet_id: data.betId,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row as GroupBetPreview | undefined) ?? null;
  });
