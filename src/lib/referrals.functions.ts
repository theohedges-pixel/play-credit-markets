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
