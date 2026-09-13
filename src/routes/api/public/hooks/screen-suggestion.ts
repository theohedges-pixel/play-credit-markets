import { verifyCronSecret } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

/** Temporary diagnostic: run the approval gates against one queued suggestion. */
export const Route = createFileRoute("/api/public/hooks/screen-suggestion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        const { id } = (await request.json()) as { id: string };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { screenCandidate } = await import("@/lib/market-gates.server");
        const { data: s } = await (supabaseAdmin as any)
          .from("market_suggestions")
          .select("id, title, description, suggested_closes_at, status")
          .eq("id", id)
          .maybeSingle();
        if (!s) return new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 });
        const screen = await screenCandidate(process.env.LOVABLE_API_KEY!, supabaseAdmin, {
          title: s.title,
          description: s.description ?? "",
          closes_at: s.suggested_closes_at,
        });
        return new Response(JSON.stringify({ ok: true, suggestion: s.title, screen }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
