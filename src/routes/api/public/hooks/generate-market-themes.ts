import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret } from "@/lib/cron-auth.server";

/**
 * Daily rebuild of every category's AI-derived sub-themes.
 * Cron-password protected like the other public hooks; also callable from the
 * admin dashboard via the server function in admin-jobs.functions.ts.
 */
export async function runThemeGeneration() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { regenerateAllThemes } = await import("@/lib/market-themes.server");

  const result = await regenerateAllThemes(supabaseAdmin, apiKey);

  await supabaseAdmin.from("app_settings").upsert({
    key: "last_theme_generation",
    value: JSON.parse(JSON.stringify({ at: new Date().toISOString(), ...result })),
    updated_at: new Date().toISOString(),
  });

  return result;
}

export const Route = createFileRoute("/api/public/hooks/generate-market-themes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runThemeGeneration();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[generate-market-themes] failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
