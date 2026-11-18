# Pay per click, Part 3: dashboards, summary, CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both sides can read a per-click campaign at a glance: clicks per day, where they came from, per-creator results, an end-of-campaign summary once everything has settled, and a CSV for the business. Admins see the click breakdown where they decide disputes. The deliver-by date can no longer move once clicks have stopped.

**Architecture:** The click summaries from Parts 1–2 (`link_summary`, `engagement_click_summary`, `campaign_click_summary`) gain per-day counts (by Lagos date) and per-source counts. A new `campaign_click_results()` gives the settled money per hire. Pure TypeScript helpers shape the chart and the CSV, and plain components render them with no chart library. The deliver-by rule is one more check in `campaigns_before_write()`.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Next.js App Router (server components, a route handler for the CSV), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-pay-per-click-design.md` §8 (Part 3), plus the owner's decision of 2026-11-20: "Once clicks have stopped and the 72-hour waiting period begins, the business cannot extend the campaign."

## Global Constraints

- Branch `pay-per-click` (Parts 1–2 are there, unmerged). Migrations are timestamped from `20261121100000`, never editing an applied one. Run `supabase migration up` (never `db reset`), then `npm run db:types`.
- **Deliver-by lock:** on a `per_click` campaign, once `now() >= click_window_end(old.deliver_by)`, any change to `deliver_by` is refused (`42501`, message `the click window has ended`). Before that it may still move later, as today. Fixed-price campaigns are unchanged.
- **Days are Lagos calendar days:** `(created_at at time zone 'Africa/Lagos')::date`. The chart shows every day from the first click (or the hire's start) to the end of the window or today, whichever is earlier; days with no clicks show as zero.
- **No chart library** (CLAUDE.md §2, §4a). The chart is CSS bars or inline SVG built from design tokens, readable at 390px, with an accessible table fallback (a visually hidden table or `aria-label` per bar).
- **Money shown:** "spent" = released; "back to you" = refunded (which already includes any fee returned); "our fee" for the business = the business fee kept = `business_fee_kobo − (refunded − (price − released))`; for the creator, the fee = released − their net (from the settlement's ledger group, as `creator_net_kobo` already is).
- **The summary appears only when every per-click hire on the campaign is settled** (or cancelled). Before that, the live view shows.
- **CSV:** business owner only (checked in the route and again by the database function); one row per hire; cells that start with `=`, `+`, `-`, `@` or a tab get a leading `'` (CSV injection); amounts are naira with two decimals via `koboToNairaString`; the filename is `pitchype-clicks-<campaign slug or id>-<Lagos date>.csv`.
- CLAUDE.md applies: data access only in `src/lib/db/*`; design tokens only; skeletons for new sections; check at 390px.

## Review Focus

1. **A click at 23:30 Lagos (22:30 UTC)** is counted on that Lagos day, not the UTC day. Test in Task 2.
2. **A 45-day campaign at 390px:** the bars stay readable (they scroll inside their own box or thin out), and the page never scrolls sideways. Test in Task 3 (helper) and Task 4 (checked by eye).
3. **A creator name like `=HYPERLINK(...)`** comes out inert in the CSV. Test in Task 6.
4. **A campaign where one hire settled and another is still in its hold** shows the live view, not a half summary. Test in Task 5.
5. **The business tries to extend deliver-by during the 72-hour wait,** and is refused with words saying why. Test in Task 1.

---

### Task 1: No extending once clicks have stopped

**Files:**
- Create: `supabase/migrations/20261121100000_click_window_lock.sql`
- Modify: `supabase/tests/per_click_campaigns.test.sql`
- Modify: `src/app/(portal)/(business)/business/campaigns/[id]/edit/live-edit-form.tsx` and its page (the deliver-by field is disabled with a note once the window has ended), `src/lib/db/campaigns.ts` (`updateLiveCampaign` maps the new refusal to `"window_closed"`)

**Interfaces:**
- Produces: `campaigns_before_write()` (replaced from `20261119100000`) with the rule in Global Constraints; `updateLiveCampaign(): Promise<"saved" | "locked" | "window_closed">`.

- [ ] **Step 1: Write the failing pgTAP**: on an open per-click campaign whose `deliver_by` is yesterday (set while it's a draft, as the Part 2 race fixture does), `update … set deliver_by = deliver_by + 3` throws `42501` with the message `the click window has ended`. On one whose window is still open, moving it later lives. On a fixed-price campaign with yesterday's `deliver_by`, moving it later lives (unchanged).
- [ ] **Step 2: Run it and see it fail; write the migration; run it and see it pass.** Run: `supabase migration up && supabase test db`.
- [ ] **Step 3: UI.** The live-edit page reads the click window end (`click_window_end` via the campaign's `deliver_by`, or compute it in TS with the same Lagos rule in `src/lib/campaign.ts` as `clickWindowEnded(deliverBy: string, now: Date): boolean`, unit-tested at 23:59 and 00:00 Lagos). When it has ended on a per-click campaign, the date field is disabled with: "Clicks have stopped, so the end date can't change. The campaign settles 72 hours after it ended."
- [ ] **Step 4: Lint, typecheck, test, commit.** `git commit -m "Lock a per-click campaign's end date once clicks stop"`

### Task 2: Clicks per day and by source

**Files:**
- Create: `supabase/migrations/20261121100100_click_days.sql`
- Modify: `supabase/tests/clicks.test.sql`

**Interfaces:**
- Produces:
  - `link_summary()` (replaced from `20261119100400_per_click_guards.sql`) gains `days: [{ "day": "YYYY-MM-DD", "billable": int, "hits": int }]`, ordered by day, with only the days that had hits (the gaps are filled in TS).
  - `campaign_click_summary()` gains `totals.sources: { <source>: n }` and `days` (the same shape, summed over the campaign's links), and per hire `filtered`, `sources` and `proofCount` (the number of `click_proofs`).

- [ ] **Step 1: Write the failing pgTAP.** Insert clicks as the owner at `timestamptz '2026-12-01 22:30:00+00'` (23:30 Lagos on 1 Dec) and `'2026-12-01 23:30:00+00'` (00:30 Lagos on 2 Dec). Assert `days` = `[{"day":"2026-12-01",…},{"day":"2026-12-02",…}]` with the right counts (Review Focus 1). `totals.sources` sums the sources across links. Per hire `proofCount` is 0, then 1 after a proof row is inserted.
- [ ] **Step 2: Run it and see it fail; write the migration; run it and see it pass.** Run: `supabase migration up && supabase test db`.
- [ ] **Step 3: Regenerate types and commit.** `git commit -m "Count clicks per Lagos day and by source"`

### Task 3: Chart and source helpers

**Files:**
- Create: `src/lib/click-chart.ts`, `src/lib/click-chart.test.ts`
- Create: `src/components/clicks/click-day-chart.tsx`, `src/components/clicks/click-sources.tsx`
- Modify: `src/lib/db/clicks.ts` (`LinkStats` and `CampaignClicks` gain `days`, `sources`; the hire rows gain `filtered`, `sources`, `proofCount`)

**Interfaces:**
- Produces:
  - `fillDays(days: { day: string; billable: number; hits: number }[], from: string, to: string): { day: string; billable: number; hits: number }[]` (every Lagos day from `from` to `to` inclusive, gaps as zero, capped at 120 days, keeping the latest).
  - `barHeights(values: number[], maxPx: number): number[]` (a non-zero value is at least 2px; all zeros → all 0).
  - `sourceRows(sources: Record<string, number>): { source: ClickSource; label: string; count: number; share: number }[]` (sorted by count, then by label; `share` is a whole percent; the labels come from `CHANNEL_LABELS` plus "Other websites" and "Unknown or direct").
  - `<ClickDayChart days={…} />`: bars for billable clicks, a lighter track for all hits, a day label every 7th bar, and the total above. It scrolls horizontally inside its own box when there are more than 31 days. There's a visually hidden table of day, counted and all visits.
  - `<ClickSources sources={…} />`: rows of label, count and a thin share bar.

- [ ] **Step 1: Write the failing unit tests.** `fillDays` fills 2026-12-01..2026-12-05 from two days of data, with zeros between. It crosses a month end (`2026-11-30` → `2026-12-01`). A 200-day range returns 120 days ending on `to`. `barHeights([0, 5, 10], 80)` → `[0, 40, 80]`. `barHeights([0, 1, 1000], 80)[1]` ≥ 2. `sourceRows({ whatsapp: 3, unknown: 1 })` → WhatsApp 75%, then "Unknown or direct" 25%.
- [ ] **Step 2: Run them and see them fail; implement; run them and see them pass.** Run: `npm test`.
- [ ] **Step 3: Build the two components** from tokens (`brand-violet` for counted clicks, `surface-soft` for the track, ink text), with no client JS.
- [ ] **Step 4: Commit.** `git commit -m "Add the click chart and sources"`

### Task 4: The live views

**Files:**
- Modify: `src/app/(portal)/(business)/business/campaigns/[id]/page.tsx` (replace "Clicks so far" with a fuller "Clicks" section)
- Modify: `src/app/(portal)/(influencer)/jobs/[id]/page.tsx`, `src/app/(portal)/(business)/business/engagements/[id]/page.tsx` (add the chart and sources under `ClickSummary`)
- Modify: the skeletons of those pages, if a new section changes their shape

**Interfaces:**
- Consumes: Task 3's components; `getCampaignClicks()` and `getEngagementClicks()` with the new fields.

- [ ] **Step 1: The business campaign page.**
  - Totals: clicks counted, visits not counted, spent so far, and budget left across funded places.
  - The day chart and the sources.
  - A per-creator table: creator (a link to the hire), counted / cap, spent, a "Posts added" yes/no, and a warning icon with text for a blocked-channel share. On a phone each creator is a stacked card; from 768px it's a table.
  - "Download CSV" (Task 6).
- [ ] **Step 2: The hire pages** (creator and business): the day chart and the sources under the counts. On the creator's page, earned so far, the fee (snapshot, at least the minimum) and "You'll receive" (`creatorFee()` from `fees.ts`).
- [ ] **Step 3: Exercise them.** Use throwaway local accounts (`dbg-…@example.com`) and insert clicks across several Lagos days as the owner. Check at 390px and 1280px, including a 45-day campaign (Review Focus 2: no sideways page scroll). Delete the accounts afterwards; the click rows need the append-only trigger switched off inside one transaction, as Parts 1–2 did.
- [ ] **Step 4: Lint, typecheck, test, commit.** `git commit -m "Show clicks per day and by source"`

### Task 5: The end-of-campaign summary

**Files:**
- Create: `supabase/migrations/20261121100200_campaign_click_results.sql` (+ assertions in `supabase/tests/click_settlement.test.sql`)
- Create: `src/components/clicks/click-results.tsx`
- Modify: `src/lib/db/clicks.ts` (`getCampaignClickResults()`), the business campaign page and the creator job page

**Interfaces:**
- Produces: `campaign_click_results(campaign uuid) returns jsonb` (security definer; owner or admin), `null` unless every per-click hire on the campaign is settled or cancelled. Otherwise: `{ totals: { billable, spentKobo, backKobo, feeKeptKobo }, hires: [{ engagementId, creatorName, billable, releasedKobo, backKobo, feeKeptKobo, status }] }` with fee kept by the Global Constraints formula. The creator's job page uses its own hire's settled fields and `creator_net_kobo` (already on the engagement details), so it needs no new SQL.

- [ ] **Step 1: Write the failing pgTAP**: with one hire settled and one still `in_progress` → null (Review Focus 4). Once both are settled → the totals add up: `spentKobo + backKobo + feeKeptKobo = Σ(price + business fee)`, where the fees are each hire's own snapshot.
- [ ] **Step 2: Run it and see it fail; write the migration; run it and see it pass.**
- [ ] **Step 3: UI.** The business campaign page, once results exist, shows "How it went" above the live view: clicks counted, spent, back to your wallet, our fees, and per creator. The creator's job page, once settled: clicks counted, released, our fee, received.
- [ ] **Step 4: Exercise it.** Settle a local hire through `settle_click_hire` (as postgres, on a hire funded through `start_payment` + `record_card_payment` so its escrow is real), then view both pages at 390px.
- [ ] **Step 5: Commit.** `git commit -m "Summarise a per-click campaign once it has settled"`

### Task 6: CSV for the business

**Files:**
- Create: `src/lib/click-csv.ts`, `src/lib/click-csv.test.ts`
- Create: `src/app/(portal)/(business)/business/campaigns/[id]/clicks.csv/route.ts`

**Interfaces:**
- Consumes: `getCampaignClicks()` and `getCampaignClickResults()`; `koboToNairaString` from `ledger-csv.ts`.
- Produces: `clicksToCsv(rows: { creatorName: string; code: string | null; billable: number; notCounted: number; spentKobo: number; backKobo: number | null; status: string }[]): string`, with the header `Creator,Link,Clicks counted,Visits not counted,Spent (NGN),Back to you (NGN),Status`.

- [ ] **Step 1: Write the failing tests.** A plain row comes out quoted as needed. A name `=HYPERLINK("x")` becomes `"'=HYPERLINK(""x"")"` (Review Focus 3). Commas and new lines in names are quoted. Amounts are `1234.50`, and an unsettled hire leaves "Back to you" empty.
- [ ] **Step 2: Run them and see them fail; implement; run them and see them pass.**
- [ ] **Step 3: The route.** `GET` → 401 when signed out, 404 unless the signed-in business owns a per-click campaign (the database summary returns null otherwise), then `text/csv` with `content-disposition: attachment` and `cache-control: no-store`. Exercise it with curl using a local session cookie (the `local-visual-check` memory describes how).
- [ ] **Step 4: Commit.** `git commit -m "Export a per-click campaign's clicks as CSV"`

### Task 7: Admins see the clicks

**Files:**
- Modify: `src/app/(portal)/(admin)/admin/disputes/[id]/page.tsx` (a "Clicks" `SectionCard` with `ClickSummary` in a new `viewer="admin"` mode, the day chart and the sources, above the decision)
- Modify: `src/app/(portal)/(admin)/admin/money/engagements/[id]/page.tsx` (the same, under the money trail)
- Modify: `src/components/clicks/click-summary.tsx` (`viewer: "creator" | "business" | "admin"`; admin wording is neutral, "Counted", "Worth")

- [ ] **Step 1: Implement** (no new data: the summary functions already allow admins).
- [ ] **Step 2: Exercise it** as a local admin at 1280px. (There's no admin test account: make one the way `money-race-lib.mjs` `newAdmin()` does, and delete it afterwards.)
- [ ] **Step 3: Lint, typecheck, test, commit.** `git commit -m "Show admins the clicks behind a dispute"`

### Task 8: Docs

- [ ] Update CLAUDE.md §5 pay per click (Part 3 built, the deliver-by lock), `docs/TODO.md` (tick Part 3), and the spec §8 (built; differences). Run the final check: `npm run lint && npm run typecheck && npm test && supabase test db && node scripts/money-race.mjs`. Commit: `git commit -m "Document click dashboards"`.
