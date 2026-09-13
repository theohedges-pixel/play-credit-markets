import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
