# Roadmap

## Open
- [ ] Bucket B (stale markets with trades): currently empty — recheck after each generator run.
- [ ] Verify profile privacy lockdown (credits hidden from other users, leaderboard intact)
- [ ] Watch for vague/round closes_at on generated markets (e.g. "end of Q3", month-end) — warnings log but don't block.


## Done
- [x] Cron shared-secret guard on /api/public/hooks/*
- [x] Polymarket sync consolidation, dedupe index, odds refresh
- [x] Stale AI market audit + Bucket A cleanup (19 removed)
- [x] Grounded topic sourcing + staleness verification + semantic duplicate detection
