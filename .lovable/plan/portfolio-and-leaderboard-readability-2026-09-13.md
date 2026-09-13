# Portfolio and Leaderboard Readability

## Portfolio
- Move the financial summary to the top, followed by Positions and Daily Reward; place the bio editor last as secondary profile maintenance.
- Present Cash and Position Value as compact contributors to a larger Net Worth total, and Unrealized/Realized as contributors to a larger Total P&L total.
- Use three-way value styling: positive green, exact zero muted/neutral, negative coral.
- Sort positions by calculated current position value descending before rendering, with stable title ordering for equal values.

## Leaderboard
- Include profile creation time in the leaderboard view and query.
- Sort by net worth descending, then account creation time ascending, then username for deterministic ties.
- Highlight the signed-in user’s row with semantic accent styling and a clear “you” label.

## Verification and Findings
- Capture before and after screenshots of both pages at the same desktop viewport.
- Verify the signed-in Portfolio and Leaderboard flows in the live preview.
- Report the previous behavior: positions currently have no explicit ordering and therefore follow database-return order; leaderboard currently orders only by net worth, with no explicit tiebreaker.

## Technical Details
- Update the existing leaderboard database view to expose `created_at`; keep current net-worth math unchanged.
- Add complete route metadata to both edited pages while preserving existing app behavior.
- No changes to trading, pricing, balances, or P&L formulas.
