import { timingSafeEqual } from "crypto";

/**
 * Shared-secret guard for /api/public/hooks/* cron endpoints.
 * The secret lives in app_settings (key 'cron_secret'), readable only
 * server-side; pg_cron sends it as the x-cron-secret header.
 * Returns null when authorized, or a 401/500 Response to send back.
 */
export async function verifyCronSecret(request: Request): Promise<Response | null> {
  const provided = request.headers.get("x-cron-secret") ?? "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  const expected = error ? null : ((data?.value as unknown) as string | null);
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: "Cron secret not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
