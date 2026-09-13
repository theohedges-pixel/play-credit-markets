# Roadmap

## Urgent
- [ ] PUBLISH the app — cron runs the published build, so all generator fixes
      (date grounding, topic grounding, staleness gate, semantic dedupe) are
      inactive in production until then.

## Open
- [ ] Bucket B (stale markets with trades): currently empty — recheck after each generator run.
- [ ] Verify profile privacy lockdown (credits hidden from other users, leaderboard intact)

## Done
- [x] Cron shared-secret guard on /api/public/hooks/*
- [x] Polymarket sync consolidation, dedupe index, odds refresh
- [x] Stale AI market audit + Bucket A cleanup (19 removed)
- [x] Grounded topic sourcing + staleness verification + semantic duplicate detection
