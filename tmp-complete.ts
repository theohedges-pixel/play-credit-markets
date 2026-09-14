import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { completeMarketGroups } from "./src/lib/polymarket-groups.server";

const r = await completeMarketGroups(supabaseAdmin, {
  budget: 60,
  eventIds: ["30829", "31552"],
});
console.log(JSON.stringify(r.events, null, 1), "imported", r.imported);
