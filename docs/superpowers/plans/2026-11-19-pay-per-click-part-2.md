# Pay per click, Part 2: click money — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-click hires settle exactly for their billable clicks after a 72-hour hold. The business keeps its fee only on what was spent (with floors). Withdrawals, cancels, never-started hires and disputes during the hold all work, and creators can add proof for the record.

**Architecture:** Settlement reuses `settle_money()`, the one function that empties escrow. A per-click branch computes the business fee kept, and a new internal `settle_click_hire()` turns the link's billable count into the released amount. `settle_due_click_hires()` is a service-role function that a daily cron route calls. It sends the "hold started" notices once and settles each due hire in its own subtransaction. Proof for the record is an append-only `click_proofs` table, and screenshots reuse `proof_files` as a third parent.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Next.js route handlers and server actions, `node --test`, `scripts/money-race.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-18-pay-per-click-design.md` (§3, §5 steps 6–8, §7; Part 1 is built on branch `pay-per-click`, see the Part 1 plan and CLAUDE.md §5 "Pay per click").

## Global Constraints

- Work on branch `pay-per-click` (Part 1 is there, unmerged). New migrations are timestamped from `20261120100000`. Never edit an applied migration. Run `supabase migration up` locally (never `db reset`), then `npm run db:types`.
- **Lock order** on every path: the business's `users` row (no key update), then the engagement (`for update`), then the tracked link (`for update`). `record_click()` takes the engagement `for share` and then the link, so once settlement holds the engagement, no further click can count.
- **Released amount** = `least(billable_clicks × cpc_kobo, agreed_price_kobo)`, always whole naira. Outcome: `release` if it equals the price, `refund` if 0, otherwise `split`. Status: `accepted` if released > 0, otherwise `refunded`.
- **Business fee kept on a per-click hire, when not at fault:** `least(business_fee_kobo, greatest(round_half_up(released × business_fee_bps / 10000), min_fee_kobo, paystack_charge))`. `business_fee_bps` and `min_fee_kobo` come from the engagement's `fee_config_id` row. `paystack_charge` is the `paystack_fee_kobo` of the payment that funded the hire, or 0 if the wallet funded it. Fee back = `business_fee_kobo − kept`, credited to the business wallet in the same `hire_settled` group. The fault rule (`refund_creator_fault`) is unchanged.
- **Creator fee:** unchanged: 5%, at least ₦500, never more than the part released (snapshot on the engagement).
- **Click window end** = `((deliver_by + 1)::timestamp at time zone 'Africa/Lagos')`, using the campaign's current `deliver_by` (it can only move later). **Settles at** = window end + 72 hours.
- **Cap** comes from `engagements.agreed_price_kobo / campaigns.cpc_kobo` (a Part 1 deferred minor, moved here).
- **Withdrawal after start (per click):** sets `engagements.clicks_stopped_at = now()`. No money moves, the status stays `in_progress`, and the hire settles at the hold like any other. A second withdrawal is refused with `engagement_locked`.
- **Business cancel before start:** the existing `cancel_funded_engagement()` with the per-click fee rule at released = 0. Creator cancel before start: unchanged (fault refund).
- **Disputes on a per-click hire:** either side may open one from `in_progress` once the click window has ended and the hire is unsettled (the hold). Before the window ends: `dispute_not_allowed_yet`. An open dispute stops automatic settlement. An admin decides with the existing outcomes, and the per-click fee rule applies to the amount released.
- **Notifications:** new kinds `click_cap_reached` (to the creator, once per hire) and `click_hold_started` (to both, once per hire, from the daily job). Both are emailed `always`. The settlement reuses `engagement_settled`.
- **Proof for the record:** creator only, while `in_progress` and unsettled. Each one has 1–10 links and/or 0–5 screenshots and at least one of either, plus an optional note of up to 1,000 characters. It is append-only, has no review and moves no money.
- Copy: "We keep 5% of what's spent, at least ₦500 or the card charge."
- CLAUDE.md applies: data access only in `src/lib/db/*`; Server Actions authenticate → authorize → validate → act; design tokens only; skeletons for new pages; check pages at 390px. Every money function that two callers could reach gets a race scenario.

## Review Focus

1. **The deliver-by date is extended after some hires' hold notices went out.** They settle at the new date, and the notice isn't sent twice. Test in Task 2.
2. **A wallet-funded per-click hire (Paystack charge 0)** keeps max(5% of spent, ₦500), never more than the fee. Test in Task 1 (TS) and Task 2 (pgTAP).
3. **A creator withdraws, then their link is clicked.** The click is `hire_ended`, and at the hold they're paid only for clicks before the withdrawal. Test in Task 3.
4. **The daily job runs while an admin decides a dispute on the same hire.** Exactly one settlement happens. Race in Task 4.
5. **The daily job runs twice at the same moment.** Each hire settles once and each notice goes out once. Race in Task 4.

---

### Task 1: The per-click fee in TypeScript

**Files:**
- Modify: `src/lib/fees.ts`, `src/lib/fees.test.ts`

**Interfaces:**
- Produces: `clickFeeKept(input: { releasedKobo: number; businessFeeKobo: number; paystackChargeKobo: number; businessFeeBps?: number; minFeeKobo?: number }): number` (defaults are the current config: 500 bps and 50,000 kobo), and `clickSettlement(input: { billable: number; cpcKobo: number; budgetKobo: number; businessFeeKobo: number; paystackChargeKobo: number; creatorFeeBps?: number; creatorMinFeeKobo?: number }): { releasedKobo: number; creatorFeeKobo: number; creatorNetKobo: number; businessFeeKeptKobo: number; businessBackKobo: number }`. `businessBackKobo` = budget − released + (fee − kept). Both use the same half-up rounding as `creatorFee()`.

- [ ] **Step 1: Write the failing tests** in `fees.test.ts`:
  - `clickFeeKept({ releasedKobo: 1_000_000, businessFeeKobo: 125_000, paystackChargeKobo: 53_078 })` === `53_078`. The charge is the largest of the three floors (₦10,000 spent on a ₦25,000 budget).
  - `clickFeeKept({ releasedKobo: 2_500_000, businessFeeKobo: 125_000, paystackChargeKobo: 53_078 })` === `125_000` (fully spent: the whole fee).
  - Wallet-funded (charge 0), released 0 → `50_000`. Released 2,000,000 → `100_000`.
  - It never exceeds the fee: `clickFeeKept({ releasedKobo: 0, businessFeeKobo: 50_000, paystackChargeKobo: 60_000 })` === `50_000`.
  - Invariant: for every budget from ₦5,000 to ₦1,000,000 in ₦5,000 steps, and released ∈ {0, half the budget, the budget}, kept ≥ `paystackCharge(budget + feeExample(budget).businessFeeKobo)` and kept ≤ the fee.
  - `clickSettlement({ billable: 600, cpcKobo: 5_000, budgetKobo: 5_000_000, businessFeeKobo: 250_000, paystackChargeKobo: 95_406 })` → `{ releasedKobo: 3_000_000, creatorFeeKobo: 150_000, creatorNetKobo: 2_850_000, businessFeeKeptKobo: 150_000, businessBackKobo: 2_100_000 }` (the worked example in the spec, §3).
  - Billable beyond the cap: `billable: 2000` on a 1,000-click budget → `releasedKobo === budgetKobo`.
- [ ] **Step 2: Run it and see it fail.** Run: `npm test` — Expected: FAIL (`clickFeeKept` is not exported).
- [ ] **Step 3: Implement both** in `fees.ts`, next to `faultRefund()`. Add a comment pointing to the SQL in Task 2.
- [ ] **Step 4: Run it and see it pass.** Run: `npm test` — Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add the per-click fee and settlement maths"`

### Task 2: Settling per-click hires in the database

**Files:**
- Create: `supabase/migrations/20261120100000_click_notification_kinds.sql` (only `alter type public.notification_kind add value 'click_cap_reached'; … 'click_hold_started';`, because enum values can't be used in the migration that adds them)
- Create: `supabase/migrations/20261120100100_click_settlement.sql`
- Create: `supabase/tests/click_settlement.test.sql`

**Interfaces:**
- Consumes: Part 1's `tracked_links`, `click_window_open()`, `record_click()`; `settle_money()` (latest version in `20261113100250`).
- Produces:
  - Columns: `engagements.clicks_stopped_at timestamptz` and `engagements.click_hold_notified_at timestamptz`.
  - `click_window_end(deliver_by date) returns timestamptz` (immutable) and `click_settles_at(deliver_by date) returns timestamptz` (window end + 72 hours).
  - `settle_money()` (replaced): when the hire's campaign is `per_click` and `fault` is false, the fee back follows the Global Constraints rule. Everything else is unchanged.
  - `settle_click_hire(engagement uuid, actor uuid, reason text) returns void`: internal, no grant to any role. It locks users → engagement → link, is a no-op if settled, refuses with `engagement_locked` unless the status is `funded` or `in_progress`, computes released from the link (0 if no link), and calls `settle_money(e.id, outcome, released, false, status, null, actor, reason)`.
  - `settle_due_click_hires() returns jsonb` `{ "notified": int, "settled": int, "failed": int }`, `security definer`, granted to `service_role` only. Part 1 sends `click_hold_started` (facts: `engagement_id`, `campaign_title`, `settles_at`, `billable`, `earned_kobo`) to both people on every unsettled `funded`/`in_progress` per-click hire whose window has ended and whose `click_hold_notified_at` is null, then sets that column. Part 2 calls `settle_click_hire(id, null, 'click_hold_ended')` on every unsettled `funded`/`in_progress` per-click hire past `click_settles_at`, each inside `begin … exception when others then failed++` so one failure doesn't block the rest.
  - `engagement_click_summary()` JSON gains `clicksEndAt`, `settlesAt`, `clicksStoppedAt`, `creatorFeeBps`, `creatorMinFeeKobo` (the snapshot, which may be null before funding).

- [ ] **Step 1: Write the failing pgTAP test** `click_settlement.test.sql`. Use the fixture style of Part 1's `clicks.test.sql`: one per-click campaign with ₦50 a click and a ₦25,000 budget (500 clicks). Fund the hires through `start_payment()` + `record_card_payment()` the way `settlement.test.sql` does, so the ledger and the Paystack charge are real; fund one hire from the wallet. Assertions:
  - `settle_money`, `settle_click_hire` and `settle_due_click_hires` have no execute grant for `authenticated` or `anon`; `settle_due_click_hires` is granted to `service_role`.
  - Card-funded hire with 200 billable clicks (set the counter as the owner): after `settle_click_hire` the status is `accepted` and `released_kobo = 1000000`. The hire's ledger group sums to 0 and the escrow for the hire is 0. The creator wallet gains `950000`. Revenue gains the creator fee `50000` plus the kept business fee, which equals `greatest(50000, the payment's paystack_fee_kobo)`. The business wallet gains `1500000 + (125000 − kept)`.
  - The same hire again: no new ledger rows.
  - A hire with 0 clicks: `refunded`, business wallet gains the budget plus `(125000 − greatest(50000, charge))`.
  - Wallet-funded hire with 500 clicks: `accepted`, released `2500000`, kept `125000`.
  - Never-started funded hire (no link) at the hold: `refunded` with the per-click fee rule.
  - A business cancel of a funded, not-started per-click hire: business wallet gains `2500000 + 125000 − greatest(50000, charge)`.
  - `settle_due_click_hires()` with a campaign whose `deliver_by` = Lagos today − 4 (hold over): returns `settled` ≥ 1, and a hire with an open dispute is left `disputed`.
  - With `deliver_by` = Lagos today − 1 (window ended, hold not over): `notified` = 2 per hire (both people), `settled` = 0, `click_hold_notified_at` set. A second call notifies 0.
  - Review Focus 1: after the notice, move `deliver_by` 5 days later (as the owner) and call again: nothing settles and nothing is re-notified.
  - `click_window_end(date '2026-12-24')` = `timestamptz '2026-12-25 00:00:00+01'`, and `click_settles_at(…)` = `'2026-12-28 00:00:00+01'`.
  - The fixed-price money paths are unchanged: rerunning `settlement.test.sql` passes (Step 4 runs the whole suite).
- [ ] **Step 2: Run it and see it fail.** Run: `supabase test db supabase/tests/click_settlement.test.sql` — Expected: FAIL (`click_window_end` does not exist).
- [ ] **Step 3: Write both migrations.** `settle_money` is replaced from its latest version (`20261113100250_fix_fault_refund_charge.sql`). Put the per-click fee back in the same place as the fault fee back: `fee_back := e.business_fee_kobo − kept` with `kept` from the rule. The charge comes from the same "payment that funded the hire" subquery the fault branch uses. Comment the invariants at the top: escrow is emptied exactly once, the fee kept covers the charge, the lock order, and that the cron is idempotent.
- [ ] **Step 4: Run them and see them pass.** Run: `supabase migration up && supabase test db` — Expected: every file PASSes, including `settlement.test.sql`, `funding.test.sql` and `disputes.test.sql`.
- [ ] **Step 5: Regenerate the types.** Run: `npm run db:types && npm run typecheck` — Expected: clean.
- [ ] **Step 6: Commit.** `git commit -m "Settle per-click hires for their clicks after the hold"`

### Task 3: Withdrawal, the cap notice, and disputes during the hold

**Files:**
- Create: `supabase/migrations/20261120100200_click_hire_actions.sql`
- Modify: `supabase/tests/click_settlement.test.sql` (add assertions; bump the plan count)

**Interfaces:**
- Consumes: Task 2's columns and functions.
- Produces:
  - `withdraw_from_engagement()` (replaced from `20261117100000`). For a per-click hire in `in_progress`: if `clicks_stopped_at` is null, set it and return; otherwise raise `engagement_locked`. Fixed-price hires are unchanged.
  - `record_click()` (replaced from `20261119100200`): `hire_ended` also when `clicks_stopped_at` is not null; the cap is `agreed_price_kobo / cpc_kobo` from the engagement row read under the share lock; on the click that makes `billable_clicks = cap`, call `notify(creator, 'click_cap_reached', {engagement_id, campaign_title, cap, earned_kobo}, 'click_cap:' || engagement)`.
  - `open_dispute()` (replaced from `20261117100200`): for a per-click hire in `in_progress`, either person may open once `now() >= click_window_end(deliver_by)` and the hire is unsettled; before that, `dispute_not_allowed_yet`. Fixed-price rules are unchanged.

- [ ] **Step 1: Write the failing assertions**:
  - The creator withdraws a started per-click hire: `clicks_stopped_at` is set, the status is still `in_progress`, and no ledger rows are written. A second withdrawal throws `engagement_locked`. Then `record_click` on its link → `hire_ended` (Review Focus 3), and at the hold it settles for the clicks counted before the withdrawal.
  - With the counter at cap − 1, a click makes a `click_cap_reached` notification for the creator. The next click (`cap_reached`) makes none, so the count stays at 1.
  - `open_dispute` by the creator while the window is open → `dispute_not_allowed_yet`. Once the window has ended (deliver_by = Lagos today − 1) it lives for the creator, and on a second hire for the business. `settle_due_click_hires` then skips the disputed hire. `withdraw_dispute` puts it back to `in_progress`, and the next run settles it.
  - `decide_dispute(…, 'split', 400000, …)` on a disputed per-click hire releases ₦4,000, and the business keeps `greatest(50000, charge)` as the fee (the per-click rule).
- [ ] **Step 2: Run them and see them fail.** Run: `supabase test db supabase/tests/click_settlement.test.sql` — Expected: FAIL on the withdrawal assertion.
- [ ] **Step 3: Write the migration.** Comment which existing behaviour each replaced function keeps.
- [ ] **Step 4: Run and see it pass.** Run: `supabase migration up && supabase test db` — Expected: all PASS, including `disputes.test.sql` and `clicks.test.sql`.
- [ ] **Step 5: Commit.** `git commit -m "Stop clicks on withdrawal, notify at the cap, allow disputes during the hold"`

### Task 4: Race scenarios for click money

**Files:**
- Modify: `scripts/money-race-lib.mjs` (helpers: `heldClickHire(billable)`, a started per-click hire whose campaign's deliver_by is set to Lagos today − 4 by flipping the campaign to draft and back as `startedClickHire` does)
- Modify: `scripts/money-race.mjs` (scenarios 25–28)

**Interfaces:**
- Consumes: `settle_due_click_hires`, `record_click`, `open_dispute`, `decide_dispute`, `withdraw_from_engagement`.

- [ ] **Step 1: Add scenario 25, "the settle job twice at once."** Run two `settle_due_click_hires()` calls in parallel over 3 held hires. Assert each hire has exactly one `hire_settled` group, escrow is 0, and the summed `settled` counts equal 3.
- [ ] **Step 2: Add scenario 26, "settle job vs open dispute."** Assert either the hire settled and the dispute was refused (`engagement_locked`), or the dispute is open and the hire is unsettled. Never both.
- [ ] **Step 3: Add scenario 27, "settle job vs decide dispute"** (Review Focus 4). The hire is disputed, then withdrawn back to `in_progress`, and the race starts at the same moment as a re-opened dispute's `decide_dispute`. Assert exactly one `hire_settled` group.
- [ ] **Step 4: Add scenario 28, "click vs settlement."** On a started per-click hire with an open window, race `record_click` (service role) against `settle_click_hire(id, null, 'race test')` (as postgres, since it's internal). Use `delayMs` on alternate rounds so both orders happen. Assert after both: `released_kobo = least(billable_clicks × 5000, agreed_price_kobo)` and the click result is `ok` (it counted before settlement read the count) or `hire_ended` (it came after). A click never counts after the settlement read the count.
- [ ] **Step 5: Run it.** Run: `node scripts/money-race.mjs` — Expected: 28/28 PASS.
- [ ] **Step 6: Commit.** `git commit -m "Race-test click settlement"`

### Task 5: The settle-clicks daily job

**Files:**
- Create: `src/lib/settle-clicks.ts`, `src/lib/settle-clicks.test.ts`
- Create: `src/app/api/cron/settle-clicks/route.ts`
- Modify: `src/lib/db/clicks.ts` (`settleDueClickHires()`), `vercel.json` (`{ "path": "/api/cron/settle-clicks", "schedule": "20 3 * * *" }`)

**Interfaces:**
- Consumes: `settle_due_click_hires()`; `authorised()` from `src/app/api/cron/authorised.ts`; `sendDueEmailsSafely()`.
- Produces: `settleDueClickHires(): Promise<{ notified: number; settled: number; failed: number }>` in `db/clicks.ts` (admin client); `runSettleClicks(deps: { settle: typeof settleDueClickHires; log: (line: string) => void }): Promise<{ ok: boolean; notified: number; settled: number; failed: number }>` in `settle-clicks.ts`, where `ok` is false when the call throws or `failed > 0`.

- [ ] **Step 1: Write failing tests** in `settle-clicks.test.ts`, the way `review-deadlines.test.ts` does:
  - A successful run returns the counts with `ok: true`.
  - A run with `failed: 1` returns `ok: false` and logs one line.
  - A throw returns `ok: false` with zero counts and one log line that holds the error class only.
- [ ] **Step 2: Run them and see them fail; implement; run them and see them pass.** Run: `npm test`.
- [ ] **Step 3: Write the route**, the same shape as `review-deadlines/route.ts`: 401 without the bearer, 500 when `!ok`, emails sent after.
- [ ] **Step 4: Exercise it locally.** `curl -s -H "Authorization: Bearer $CRON_SECRET" localhost:3030/api/cron/settle-clicks` against a held local hire. Expect `{"ok":true,"notified":…,"settled":1,…}`, and the creator's wallet page shows the credit.
- [ ] **Step 5: Commit.** `git commit -m "Run click settlement daily"`

### Task 6: Proof for the record

**Files:**
- Create: `supabase/migrations/20261120100300_click_proofs.sql`, `supabase/tests/click_proofs.test.sql`
- Create: `src/lib/db/click-proofs.ts`
- Create: `src/app/(portal)/(influencer)/jobs/[id]/click-proof-form.tsx` (based on `submit-form.tsx` and its upload flow; posting to the new action)
- Modify: `src/app/(portal)/(influencer)/jobs/[id]/actions.ts` (`recordClickProofAction`), both hire pages (list the proofs; reuse `src/components/engagement/rounds.tsx` if its props fit, otherwise a small `ClickProofList` in `src/components/clicks/`)

**Interfaces:**
- Produces: table `click_proofs(id uuid pk, engagement_id uuid not null, author_id uuid not null, note text null (1–1,000 characters, trimmed), links text[] not null default '{}' (≤ 10), created_at timestamptz)`, append-only with the `reject_change` triggers; `proof_files.click_proof_id uuid` with the one-parent check widened to three parents (at most one set); the proof-files select policy extended to click proofs (the two people on the hire and admins); `delete_orphan_proof_files()` also requires `click_proof_id is null`; `record_click_proof(engagement uuid, note text, links text[], file_ids uuid[]) returns uuid` (authenticated; creator of a per-click hire in `in_progress`, unsettled; the link, file and ownership checks copied from `write_dispute_statement`; at least one link or file; refusals `no_such_engagement`, `engagement_locked`, `proof_invalid`, `not_your_file`, `proof_required`); and `listClickProofs(engagementId)` in `db/click-proofs.ts` returning `{ id, createdAt, note, links, files: { id, url }[] }[]`, with signed URLs through `proofFileUrls()`.

- [ ] **Step 1: Write the failing pgTAP** `click_proofs.test.sql`:
  - The creator records a proof with one link → an id. With nothing → `proof_required`. On a fixed-price hire → `engagement_locked`. Another creator → `no_such_engagement`. With a file owned by someone else → `not_your_file`.
  - Rows are append-only.
  - The business reads the proof and its files; another business reads nothing.
  - `delete_orphan_proof_files()` keeps a day-old file attached to a click proof.
- [ ] **Step 2: Run it and see it fail; write the migration; run it and see it pass.** Run: `supabase migration up && supabase test db`.
- [ ] **Step 3: UI.** On the creator's job page, under "Your clicks": "Add where you posted" (the form), then the list. A per-click hire with no proof once the window has ended shows "No posts added yet", in muted text on the creator page and as a warning on the business page. The business hire page lists the proofs read-only. Add `proof_required` to `src/lib/refusals.ts`.
- [ ] **Step 4: Exercise it.** Locally at 390px: add a proof with a link and a screenshot as the creator, then see it as the business.
- [ ] **Step 5: Lint, typecheck, test, commit.** `npm run lint && npm run typecheck && npm test && supabase test db`; `git commit -m "Let creators record where they posted a tracked link"`

### Task 7: Words: notifications, status, pay and cancel

**Files:**
- Modify: `src/lib/notifications.ts` (+ test), `src/lib/notification-email.ts` (+ test): cases `click_cap_reached` and `click_hold_started`, both `always`
- Modify: `src/lib/job-status-words.ts`, `src/lib/hire-status-words.ts` (+ tests): an optional `clicks` input
- Modify: `src/components/clicks/click-summary.tsx`: the fee sentence from the snapshot
- Modify: `src/app/(portal)/(business)/business/engagements/[id]/pay/page.tsx`, `pay-form.tsx`, `cancel-form.tsx`: per-click wording
- Modify: `src/app/(portal)/(influencer)/jobs/[id]/withdraw-form.tsx` and both hire pages: the per-click withdraw copy and the dispute button during the hold

**Interfaces:**
- Consumes: Task 2's summary fields (`clicksEndAt`, `settlesAt`, `clicksStoppedAt`, `creatorFeeBps`, `creatorMinFeeKobo`); add them to `LinkStats` in `db/clicks.ts`.
- Produces: `describeJobStatus(input, now, clicks?: { endsAt: string; settlesAt: string; stoppedAt: string | null; earnedKobo: number })` and the same optional parameter on `describeHireStatus`.

- [ ] **Step 1: Write failing tests.**
  - `describeNotification` for `click_cap_reached` → a title naming the campaign, a body with the cap, and a link to `/jobs/<id>`. For `click_hold_started` → the creator reads "Clicks are in. You'll be paid on <date>", and the business reads "Clicks are in. This settles on <date>; flag a problem before then". Each has its link.
  - Both kinds are in `EMAIL_POLICY` as `always`.
  - `describeJobStatus` with `clicks` while the window is open → title "Clicks counting", body naming the end date. After the window, before the hold ends → "Clicks are in", naming the settle date. With `stoppedAt` → "You withdrew", "clicks stopped", naming the settle date. A settled per-click hire keeps the existing settled words.
  - `describeHireStatus` has the same three, worded for the business.
- [ ] **Step 2: Run them and see them fail; implement; run them and see them pass.** Run: `npm test`.
- [ ] **Step 3: Pages.**
  - The pay page and pay form, for a per-click hire: "Up to N clicks at ₦X", and the notice "We keep 5% of what's spent, at least ₦500 or the card charge."
  - The cancel form, for a per-click hire: "You'll get back ₦Y; we keep ₦Z", from `clickFeeKept` with released 0.
  - The withdraw form copy, for a per-click hire: "Your link stops counting now. You're paid for the clicks so far when the campaign settles."
  - The dispute button shows on both hire pages during the hold.
  - The click-summary fee sentence: "Our fee (5%, at least ₦500) comes off when the money is released."
- [ ] **Step 4: Exercise it.** Locally at 390px: the pay page for an unpaid per-click hire, the job page during the hold, and the business hire page after settlement.
- [ ] **Step 5: Lint, typecheck, test, commit.** `git commit -m "Word per-click money for both sides"`

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (§5 pay per click: drop "Not built yet (Part 2)" and add settlement, withdrawal, disputes, proof; §6.1: the per-click fee rule; §6.6: `settle_click_hire`, the lock order, race scenarios 25–28; §8: the two new kinds), `docs/TODO.md` (tick Part 2; keep "don't push to hosted until reviewed"), `docs/superpowers/specs/2026-11-18-pay-per-click-design.md` (mark §7 built and note any differences)

- [ ] **Step 1: Write the updates.**
- [ ] **Step 2: Final check.** Run: `npm run lint && npm run typecheck && npm test && supabase test db && node scripts/money-race.mjs` — Expected: all pass.
- [ ] **Step 3: Commit.** `git commit -m "Document click settlement"`
