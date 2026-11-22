# Pay per click: creators propose their own cost per click

Decided 2026-11-22. This reverses the Stage 4 rule (design `2026-11-18-pay-per-click-design.md` §5, CLAUDE.md §5) that creators cannot counter a per-click campaign's rate. Migration `20261126100000_per_click_creator_rates.sql`.

## Why

The ₦50 minimum cost per click let a business pay the least it could and left creators nothing to say about it except to walk away. A creator who proposes a rate, and a business that sees every rate before it hires, gives both sides a way to agree a price. The earlier guidance work (`perClickGuidance()` in `src/lib/campaign.ts`) shows the business what a rate means; this lets creators answer it.

## What changes

- **The creator** may propose a price per click when applying, or later while the application is undecided. Blank means "take the business's rate". The rate is whole naira, at least ₦50, and must divide the budget per place evenly (the rule the campaign's own rate already follows), so a hire's cap is always a whole number of clicks. The apply form shows what the typed rate earns and what the creator keeps after our fee, and says which rates fit if theirs doesn't.
- **The business** keeps setting the starting rate and the budget per place. Its applications page shows each creator's rate beside its own, a summary of the rates still to decide, clicks needed for the whole budget, and an "order by lowest rate" link. It hires at the rate it saw.
- **The budget is unchanged**, so the most a business can spend per place never grows. A higher rate means fewer clicks earn the budget. The business fee is on the budget as before.

## How it is built

- `applications.proposed_cpc_kobo`: null (accept the business's rate) or a proposal. A rate equal to the campaign's is stored as null. A trigger refuses a rate on a fixed-price campaign (`rate_per_click_only`) or one that doesn't divide the budget (`rate_invalid`).
- `set_application_rate(application, rate_kobo)`: the creator's call, allowed while the application is `submitted` or `shortlisted`. `apply_to_campaign()` and `approve_application()` are deliberately **not** redefined: other work adds identity checks to both, and redefining them here would drop those. So applying is two calls (apply, then set the rate); a failure on the second leaves a valid application at the business's rate, and the creator is told to set the rate again.
- `approve_application_at_rate(application, expected_price_kobo, expected_cpc_kobo)`: the business's call for a per-click hire. It locks the campaign, then the application (the order `approve_application()` uses), refuses `rate_changed` if the creator's rate is no longer the one the business saw, and then calls `approve_application()` unchanged. A fixed-price hire still uses `approve_application()`.
- `engagements.cpc_kobo`: a trigger on insert stamps the hire with the creator's proposal, or else the campaign's rate; null on a fixed-price hire. It never changes afterwards. Existing per-click hires were backfilled with their campaign's rate.
- **Readers use the hire's rate**: `record_click` (the cap), `link_summary`, `engagement_click_summary`, `campaign_click_summary`, `settle_click_hire`, `settle_due_click_hires` and `settle_engagement_internal` (an admin's or a dispute's release) read `engagements.cpc_kobo`, not `campaigns.cpc_kobo`. `engagement_json()` carries `cpc_kobo`.

## Decisions made while building

- A creator's edit of their rate does not notify the business (only the first application does). The approval check covers a stale page. Logged in `docs/TODO.md`.
- The apply screen suggests the nearest rates that fit the budget instead of silently rounding.
- Nothing in niche, platform or campaign length feeds a suggested rate: we have no data of our own yet, and the only Nigerian figures found were weak (see `docs/TODO.md`).

## Tests

`supabase/tests/per_click_rates.test.sql` (constraints, who may set and approve, `rate_changed`, the frozen rate, RLS on the new column, the cap and settlement at the hire's rate for two hires on one campaign, and an admin release); `src/lib/applications.test.ts` and `campaign.test.ts` (parsing and suggestions); `scripts/money-race.mjs` scenarios 29 and 30 (approval against a rate change, and a double approval).
