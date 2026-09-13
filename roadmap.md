# Roadmap

## In progress
- [ ] Verify profile privacy lockdown (credits hidden from other users, leaderboard intact, embeds via public_profiles work)

## Next: endpoint security + Polymarket sync consolidation
- [ ] Add shared-secret (x-cron-secret) check to /api/public/hooks/sync-polymarket; update pg_cron job 2 header
- [ ] Same check on generate-ai-markets and check-group-bet-outcomes if missing
- [ ] Gate "Import from Polymarket" button to admins
- [ ] Delete polymarket.functions.ts + import button; single sync path
- [ ] sync-polymarket.ts: order by volume24hr, cap inserts per run (~25)
- [ ] Partial unique index on markets.polymarket_id
- [ ] Refresh odds on untraded polymarket_import markets (NOT EXISTS trades guard), update volume + price_history
- [ ] Test: double sync no dupes; untraded odds refresh; traded market untouched
