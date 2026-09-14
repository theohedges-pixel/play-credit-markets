import { createClient } from "@supabase/supabase-js";
import { completeMarketGroups } from "@/lib/polymarket-groups.server";

const ids = process.argv.slice(2);
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const res = await completeMarketGroups(sb as any, { budget: 400, eventIds: ids });
console.log(JSON.stringify(res.events, null, 1));
console.log("imported", res.imported);
