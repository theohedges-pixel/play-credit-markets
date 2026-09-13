import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-triggered password reset.
 *
 * The admin never sees or sets a password — this sends the exact same reset
 * email the user could send themselves. Admin rights are verified inside the
 * handler (not just by the route gate) before any service-role call is made.
 */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; redirectTo: string }) => {
    if (!input?.userId) throw new Error("Missing user");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = target?.user?.email;
    if (getErr || !email) throw new Error("No email address on file for that account");

    const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (resetErr) throw new Error(resetErr.message);

    await (supabaseAdmin as any).from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "password_reset_sent",
      target_id: data.userId,
      details: { email_domain: email.split("@")[1] ?? null },
    });

    return { ok: true as const };
  });
