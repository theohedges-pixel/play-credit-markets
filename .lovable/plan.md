# Predikt — Free Prediction Markets (Credits, no real money)

A Polymarket-inspired site where users trade Yes/No shares on real-world events using free in-app credits. AMM pricing, leaderboards, user-created markets, daily credit refills.

## Pages (TanStack routes)

- `/` — Landing/home: hero, trending markets, top categories, leaderboard preview, CTA to sign up
- `/markets` — Browse all markets (filter by category, status, search)
- `/markets/$id` — Market detail: price chart, Yes/No buy panel, order activity, holders, comments-free for v1
- `/create` — Create a new market (auth required)
- `/portfolio` — My positions, P&L, transaction history (auth required)
- `/leaderboard` — Top traders by net worth (credits + position value)
- `/login`, `/signup` — Email + password auth
- `/_authenticated/*` layout for gated routes

## Design direction

Dark editorial fintech aesthetic — black background, sharp typography, single saturated accent (electric green for Yes / coral red for No). Compact data-dense market cards with inline sparklines and percentage prices. Avoid generic SaaS feel.

## Backend (Lovable Cloud)

Tables:
- `profiles` — id (FK auth.users), username, avatar_url, credits (default 1000), last_daily_claim
- `categories` — id, name, slug, icon
- `markets` — id, creator_id, title, description, category_id, closes_at, resolved_at, resolution (yes/no/null), status (open/closed/resolved), yes_pool, no_pool, liquidity_param, volume
- `positions` — id, user_id, market_id, yes_shares, no_shares, avg_yes_price, avg_no_price
- `trades` — id, user_id, market_id, side (yes/no), action (buy/sell), shares, credits, price, created_at
- `price_history` — id, market_id, yes_price, recorded_at (for charts)

RLS: users read all markets/trades/profiles (public username only); write only their own positions/trades/profile. Markets writable by creator until first trade; resolution restricted to creator or admin role via `user_roles` + `has_role()` security-definer function.

## Pricing (LMSR-style AMM)

Server function `placeTrade` runs atomically:
- Compute new price from constant-product or LMSR formula given pool state
- Deduct credits, mint shares, update pools, append `trades` and `price_history` rows
- All in a Postgres function (RPC) to keep it transactional

## Credit system

- Signup trigger creates profile with 1000 credits
- Server function `claimDailyCredits` adds 100 if `last_daily_claim` < today
- Resolution server function pays out 1 credit per winning share, zeros losing shares

## Tech notes

- Auth: Supabase email/password, no profiles question needed (already decided yes)
- Server functions in `src/lib/*.functions.ts` using `requireSupabaseAuth`
- Trade math + balance updates in a Postgres `place_trade` RPC for atomicity
- Charts via `recharts` (already common); sparklines in market cards
- `user_roles` table + `has_role()` for admin resolution permissions

## Out of scope (v1)

- Comments/social, market images, multi-outcome (>2) markets, mobile app, real-time websocket updates (poll on detail page), order book (AMM only)

Ready to build on approval.