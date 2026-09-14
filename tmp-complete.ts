import { createClient } from "@supabase/supabase-js";
import { completeMarketGroups } from "@/lib/polymarket-groups.server";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const res = await completeMarketGroups(admin as any, { budget: Number(process.argv[2] ?? 400) });
console.log(JSON.stringify(res, null, 1));
