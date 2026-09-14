import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MAX_PENDING = 5;

/**
 * A signed-in user submits a rough market idea. Every safety gate the AI
 * generator and the admin approval path use runs here too — this is a third
 * entry point into market creation and must not bypass them. Blocked
 * submissions are stored as rejected with their reason so the user sees why,
 * rather than being silently dropped.
 */
export const submitMarketSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        text: z.string().trim().min(15).max(500),
        categoryId: z.string().uuid().nullable().optional(),
        attributePublicly: z.boolean().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { moderateSubmission } = await import("@/lib/suggestion-ai.server");
    const { screenCandidate } = await import("@/lib/market-gates.server");

    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { count } = await (supabaseAdmin as any)
      .from("market_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("suggested_by", context.userId)
      .eq("status", "pending");
    if ((count ?? 0) >= MAX_PENDING) {
      return {
        status: "rate_limited" as const,
        reason: `You already have ${MAX_PENDING} suggestions waiting for review. Wait for those to be reviewed before sending more.`,
      };
    }

    let categorySlug: string | null = null;
    if (data.categoryId) {
      const { data: cat } = await supabaseAdmin
        .from("categories")
        .select("slug")
        .eq("id", data.categoryId)
        .maybeSingle();
      categorySlug = cat?.slug ?? null;
    }

    // Gate 1: content and safety. Gate 2+3: already settled / duplicate topic.
    const moderation = await moderateSubmission(apiKey, data.text);
    let reason: string | null = moderation.allowed ? null : moderation.reason;
    if (!reason) {
      const screen = await screenCandidate(apiKey, supabaseAdmin, {
        title: data.text,
        description: categorySlug ? `Category hint: ${categorySlug}` : "",
      });
      if (screen.blocked) reason = screen.reason;
    }

    const placeholderClose = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const { error } = await (supabaseAdmin as any).from("market_suggestions").insert({
      title: data.text.slice(0, 200),
      description: null,
      user_text: data.text,
      suggested_by: context.userId,
      category_id: data.categoryId ?? null,
      // null means "use whatever my account default is when this gets approved".
      attribute_publicly: data.attributePublicly ?? null,
      suggested_closes_at: placeholderClose,
      status: reason ? "rejected" : "pending",
      rejection_reason: reason,
      reviewed_at: reason ? new Date().toISOString() : null,
      source_summary: reason ? "Automatically rejected by the submission checks" : "Submitted by a member",
    });
    if (error) throw new Error(error.message);

    return reason
      ? { status: "rejected" as const, reason }
      : { status: "pending" as const, reason: "" };
  });

/** The suggestions the signed-in user has sent, newest first. */
export const mySuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("market_suggestions")
      .select("id, user_text, title, status, rejection_reason, created_at")
      .eq("suggested_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as Array<{
      id: string;
      user_text: string | null;
      title: string;
      status: "pending" | "approved" | "rejected";
      rejection_reason: string | null;
      created_at: string;
    }>;
  });

/** Live markets created from this user's suggestions, with their public-credit state. */
export const mySuggestedMarkets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("markets")
      .select("id, title, attributed_publicly, created_at")
      .eq("suggested_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as Array<{
      id: string;
      title: string;
      attributed_publicly: boolean;
      created_at: string;
    }>;
  });

/** Turn public credit on or off after the fact, for a market this user suggested. */
export const setMarketAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ marketId: z.string().uuid(), isPublic: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).rpc("set_market_attribution", {
      _market_id: data.marketId,
      _public: data.isPublic,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
