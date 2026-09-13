import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admins only");
}

export const syncPolymarketNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { runSync } = await import("@/routes/api/public/hooks/sync-polymarket");
    return runSync();
  });

export const generateAiMarketsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { runGenerate } = await import("@/routes/api/public/hooks/generate-ai-markets");
    return runGenerate();
  });

export const discoverTrendingNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { runDiscover } = await import("@/routes/api/public/hooks/discover-trending-markets");
    return runDiscover();
  });

export const resolveAiMarketsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { runResolveAiMarkets } = await import("@/routes/api/public/hooks/resolve-ai-markets");
    return runResolveAiMarkets();
  });

/**
 * Admin approval of an AI suggestion. Re-runs the staleness + topic-duplicate
 * gates immediately before creating the market, because a topic can go from
 * "open" to "settled" between queueing and approval.
 */
export const approveSuggestionChecked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        suggestionId: z.string().uuid(),
        title: z.string().min(8).optional(),
        description: z.string().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        closesAt: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { screenCandidate } = await import("@/lib/market-gates.server");

    const { data: sugg, error: loadErr } = await (supabaseAdmin as any)
      .from("market_suggestions")
      .select("id, title, description, suggested_closes_at, status")
      .eq("id", data.suggestionId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!sugg) throw new Error("Suggestion not found");
    if (sugg.status !== "pending") throw new Error(`Suggestion is already ${sugg.status}`);

    const candidate = {
      title: data.title ?? sugg.title,
      description: data.description ?? sugg.description ?? "",
      closes_at: data.closesAt ?? sugg.suggested_closes_at,
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const screen = await screenCandidate(apiKey, supabaseAdmin, candidate);
    if (screen.blocked) {
      return { approved: false as const, reason: screen.reason };
    }

    const payload: Record<string, unknown> = { _suggestion_id: data.suggestionId };
    if (data.title !== undefined) payload._title = data.title;
    if (data.description !== undefined) payload._description = data.description;
    if (data.categoryId !== undefined) payload._category_id = data.categoryId;
    if (data.closesAt !== undefined) payload._closes_at = data.closesAt;

    const { data: marketId, error } = await context.supabase.rpc(
      "approve_market_suggestion",
      payload as any,
    );
    if (error) throw new Error(error.message);
    return { approved: true as const, marketId };
  });
