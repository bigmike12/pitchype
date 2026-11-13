# Stage 6: escrow, wallets and payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A business pays for an approved hire through Paystack, the money is held in escrow on our ledger, an admin can settle it, and creators are paid out to their bank after an admin approves each payout, with every movement auditable.

**Architecture:** Money logic lives in plpgsql `security definer` functions (one transaction each, row-locked, idempotent) that post balanced groups to an append-only `ledger_entries` table. `src/lib/paystack.ts` is the only code that talks to Paystack; `src/lib/db/money.ts` and `src/lib/db/payouts.ts` are the only code that calls the money functions; one `confirmCardPayment` function in `src/lib/payments.ts` serves both the browser callback and the webhook. Pages and Server Actions authenticate, authorise, validate, then call those.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (pgTAP via `supabase test db`), `node --test` for unit tests, Paystack REST via `fetch`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-stage-6-money-design.md` (read it first; section numbers below refer to it). Also CLAUDE.md §5, §6, §7 and §9.

## Global Constraints

- Money is integer kobo (`bigint` in SQL, `number` in TS); never floats; format only with `formatNaira` from `src/lib/money.ts`.
- Business fee 5% on top, creator fee 5% at release, minimum ₦500 (`50_000` kobo) per side; all read from `fee_config` and snapshotted on the engagement at funding.
- Minimum payout ₦1,000 (`100_000` kobo). Every payout needs admin approval before any transfer is sent.
- Paystack charge model used by the invariant test: 1.5% + ₦100 (the ₦100 waived under ₦2,500), capped at ₦2,000, plus 7.5% VAT. Business fee must be ≥ this charge on `price + fee` for every price from ₦5,000 up.
- Ledger rows are never updated or deleted; every group sums to zero; corrections are reversing groups.
- Webhook: HMAC SHA-512 of the **raw** body with the secret key, checked before parsing; each event stored once.
- A payment in flight (initiated < 30 minutes ago) blocks lapse and cancel; payouts stuck in `processing` > 15 minutes are polled.
- Lock order in every money function: business/creator `users` row first, then the engagement, then the payment/payout.
- Schema changes only as new files in `supabase/migrations/` (timestamps from `20261113100000` up). Never edit an applied migration. Apply locally with `supabase migration up`; **never `supabase db reset`** (local data is in use). Regenerate types with `npm run db:types`.
- Only `src/lib/db/*` queries the database; only `src/lib/paystack.ts` calls Paystack; the secret-key Supabase client is used only for the webhook, callback verification, cron and payout completion.
- No new dependencies. Secrets only in `.env.local`; `.env.example` gets names only.
- Every new page gets a skeleton fallback in `PageLoading` and is checked at 390px. Dates shown in Lagos time with `formatDateTime`. No `console.log` of secrets, tokens or full account numbers.
- Commits: imperative, specific; end with the attribution line from the session's system-reminder.

## Review Focus

- A `charge.success` whose amount differs from the payment's frozen card amount (under- or over-payment) must not fund; it is recorded and left for an admin. Tested in Task 3.
- A webhook for a reference we don't know, or a repeated or out-of-order event, returns 200 and changes nothing (Paystack retries on non-2xx). Task 9.
- Two payout requests at once against one balance: only one succeeds. A request where the transfer fee exceeds the amount is refused. Task 5.
- The browser closes before the callback: the webhook alone funds the hire; callback and webhook racing fund it once. Tasks 3 and 9.
- A split release with `release_kobo` negative, larger than the price, or not a whole naira is refused; `release_kobo = 0` and `= price` behave as refund and full release. Task 4.
- Admin approves a payout for a creator who has since been suspended: it still goes through (spec §2, §6.5). Task 5.

---

### Task 0: Branch and secrets

**Files:**
- Modify: `.env.example`
- Create (untracked, git-ignored): `.env.local` entry

**Interfaces:**
- Produces: env var `PAYSTACK_SECRET_KEY` read by `src/lib/paystack.ts`.

- [ ] **Step 1:** `git checkout -b stage-6-money` from the current branch.
- [ ] **Step 2:** Append `PAYSTACK_SECRET_KEY=<the sk_test_ key from the user's message>` to `.env.local` only. Run `git check-ignore .env.local` and expect it to print the path. Never write the key to any tracked file, doc or commit message.
- [ ] **Step 3:** Add to `.env.example`, with a comment ("Server-only. Paystack secret key; test keys start sk_test_. Never NEXT_PUBLIC. Used for checkout, verification, webhooks and transfers."): `PAYSTACK_SECRET_KEY=`.
- [ ] **Step 4:** Commit `.env.example` ("Document the Paystack secret key").

### Task 1: Fee maths

**Files:**
- Modify: `src/lib/fees.ts`
- Modify: `src/lib/fees.test.ts`

**Interfaces:**
- Produces (all pure, integer kobo, throw on non-integer or non-positive input like `feeExample` does):
  - `paystackCharge(chargedKobo: number): number` (includes VAT, rounded to whole kobo)
  - `creatorFee(releasedKobo: number, bps = INFLUENCER_FEE_BPS, minKobo = MIN_FEE_KOBO): number` (0 when released is 0; never more than `releasedKobo`)
  - `faultRefund(priceKobo: number, businessFeeKobo: number, paystackFeesKobo: number): number` (= price + fee − charges)
  - `transferFee(amountKobo: number): number` using the tier table `TRANSFER_FEE_TIERS` (first step: confirm Paystack's current Nigerian transfer fees from their pricing page and write the tiers and the source URL in a comment; draft values ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above)

- [ ] **Step 1:** Write failing tests in `fees.test.ts`: `paystackCharge(5_250_000)` is `95_406` ± 1 kobo (₦954.06 per CLAUDE.md §6.4; pick the rounding that gives 95_406 and assert exactly); no ₦100 component under ₦2,500 (`paystackCharge(200_000)` = round(1.5% × 200_000 × 1.075)); cap: `paystackCharge(10_000_000_00)` = 2_000_00 × 1.075 = 215_000; `creatorFee(5_000_000)` = 250_000; `creatorFee(1_000_000)` = 50_000 (minimum); `creatorFee(0)` = 0; `creatorFee(30_000)` = 30_000 (capped at the amount); `faultRefund(5_000_000, 250_000, 95_406)` = 5_154_594; `transferFee` at each tier edge.
- [ ] **Step 2:** **Invariant sweep test** `business fee covers Paystack charge for every price`: for price from `500_000` to `100_000_000` kobo in `10_000`-kobo steps, assert `feeExample(price).businessFeeKobo >= paystackCharge(feeExample(price).businessPaysKobo)`.
- [ ] **Step 3:** Run `npm test -- ` (or `node --test src/lib/fees.test.ts`); expect FAIL (functions missing).
- [ ] **Step 4:** Implement the four functions in `fees.ts`; update the file's header comment: the rates now also seed `fee_config` (Task 2) and a test in Task 2 keeps them equal.
- [ ] **Step 5:** Run tests; expect PASS. Commit "Add fee maths for payments, releases and transfers".

### Task 2: Ledger, fee config and balances (migration 1)

**Files:**
- Create: `supabase/migrations/20261113100000_create_ledger.sql`
- Create: `supabase/tests/ledger.test.sql`

**Interfaces:**
- Produces tables: `fee_config(id uuid pk, business_fee_bps int, creator_fee_bps int, min_fee_kobo bigint, min_payout_kobo bigint, transfer_fee_tiers jsonb, paystack_rate jsonb, created_at)`; seeded row with the Task 1 values. `ledger_entries(id, group_id uuid, event_type text, account text check in (...spec §5 list...), owner_user_id uuid null, engagement_id uuid null, payment_id uuid null, payout_id uuid null, paystack_reference text null, amount_kobo bigint check <> 0, actor_user_id uuid null, reason text null, fee_config_id uuid, created_at timestamptz default now())`. (`payment_id`/`payout_id` are plain uuid columns here; Tasks 3 and 5 add the foreign keys.)
- Produces functions: `current_fee_config() returns public.fee_config` (latest row); `post_ledger_group(event_type text, actor uuid, reason text, engagement uuid, payment uuid, payout uuid, reference text, config uuid, lines jsonb) returns uuid` (internal; `lines` is `[{account, owner, amount}]`; raises `ledger_unbalanced` if the sum is not 0); `wallet_balance(person uuid, kind text) returns bigint` (kind `business_wallet` or `creator_wallet`; returns the amount owed to the person, i.e. minus the signed sum); `ledger_totals() returns jsonb` (sum per account, for reconciliation).
- Policies: RLS on `fee_config` (read for authenticated) and `ledger_entries` (admin reads all; others read rows for their own wallet accounts and for escrow rows of their own engagements; never `paystack`, `paystack_fees`, `platform_revenue`). No insert/update/delete grants to anyone.

- [ ] **Step 1:** Write `ledger.test.sql` (pgTAP) first, covering: seeded `fee_config` equals the TS constants (500/500 bps, 50_000 min, 100_000 min payout); `post_ledger_group` accepts a balanced group and rejects an unbalanced one with `ledger_unbalanced`; `update` and `delete` on `ledger_entries` fail (even as postgres) via a trigger; `wallet_balance` returns the owed amount; a business reads only their own wallet rows and an unrelated user reads none; `anon` reads nothing; `ledger_totals` sums to 0 across all accounts.
- [ ] **Step 2:** `supabase test db`; expect FAIL.
- [ ] **Step 3:** Write the migration (header comment names the invariants: balanced groups, append-only, signs: cash/expense positive, liabilities/revenue negative, so Paystack cash = escrow + wallets + payouts in flight + revenue − `paystack_fees`). Index `ledger_entries (owner_user_id, account)`, `(engagement_id)`, `(group_id)`. Revoke all function execute from public/anon/authenticated; grant only what later tasks say.
- [ ] **Step 4:** `supabase migration up`, `supabase test db`; expect PASS. Run `npm run db:types`.
- [ ] **Step 5:** Commit "Add fee config and the append-only ledger".

### Task 3: Payments and funding (migration 2)

**Files:**
- Create: `supabase/migrations/20261113100100_create_funding.sql`
- Create: `supabase/tests/funding.test.sql`
- Modify: `src/lib/refusals.ts` (add `payment_in_progress`, `payment_mismatch`, `not_enough_balance` and keep `isRefusal` in step), `src/lib/refusals.test.ts`

**Interfaces:**
- Consumes: Task 2 `post_ledger_group`, `current_fee_config`, `wallet_balance`.
- Produces schema: `engagements` gains `business_fee_kobo bigint`, `creator_fee_bps int`, `creator_min_fee_kobo bigint`, `fee_config_id uuid`, `funded_at`, `started_at`, `settled_at`, `settle_outcome text`, `released_kobo bigint`, `refunded_kobo bigint`; `cancel_reason` check widened with `cancelled_by_creator`. `payments(id, engagement_id, reference text unique, total_kobo, business_fee_kobo, fee_config_id, card_amount_kobo, wallet_part_kobo, status check in ('initiated','succeeded','failed'), paystack_fee_kobo, fee_notice_seen_at, created_at, updated_at)`. `payment_events(event_key text primary key, payload jsonb, received_at)` (payload stored without secrets). Add the missing foreign keys from `ledger_entries.payment_id`.
- Produces functions:
  - `start_payment(engagement uuid, fee_notice_seen boolean) returns jsonb` (authenticated, business owner; refuses unless `fee_notice_seen`; refuses unless `awaiting_payment` and not past `pay_by`; freezes total, fee and `fee_config_id`; `wallet_part = min(wallet_balance, total)`, `card_amount = total − wallet_part`; returns `{payment_id, reference, card_amount_kobo, email}`; reference format `pit_<uuid without dashes>`).
  - `pay_from_wallet(engagement uuid, fee_notice_seen boolean) returns void` (authenticated; requires `wallet_balance >= total`; funds with no card part).
  - `record_card_payment(reference text, paid_kobo bigint, paystack_fee_kobo bigint, event_key text, payload jsonb) returns text` (service_role only; returns `'funded' | 'stranded' | 'duplicate' | 'mismatch'`).
  - internal `fund_engagement(payment uuid)` shared by both; ledger groups per spec §3 and Task 2 sign rules: `payment_received` (paystack +card, then funding lines `escrow −price`, `platform_revenue −fee`, `business_wallet +wallet_part` when used), `paystack_fee` (paystack −fee, paystack_fees +fee), and for a stranded payment `paystack +card, business_wallet −card`.
  - Changed: `expire_unpaid_engagements` skips engagements with a payment `initiated` in the last 30 minutes; `cancel_engagement` raises `payment_in_progress` in the same case.

- [ ] **Step 1:** Write `funding.test.sql`: set up a business, creator, campaign and `awaiting_payment` engagement (copy the setup block from `supabase/tests/applications_rls.test.sql`). Tests: `start_payment` freezes figures (₦50,000 → total 5_250_000, fee 250_000, card 5_250_000, new reference each call is allowed but only one `initiated` payment per engagement stays active); refused without `fee_notice_seen`; `record_card_payment` with the right amount → `'funded'`, engagement `funded`, snapshot columns set, escrow rows total −5_000_000, `platform_revenue` −250_000, `paystack_fees` equals the fee passed, `ledger_totals` all sum to 0; calling it again with the same `event_key` → `'duplicate'` and no new rows; same reference different `event_key` after success → no second funding; wrong `paid_kobo` → `'mismatch'`, engagement still `awaiting_payment`, payment untouched, an audit row in `payment_events`; payment after lapse (backdate `pay_by`, run `expire_unpaid_engagements`) → `'stranded'`, business wallet balance equals card amount, engagement stays `cancelled`; a lapse job run while a payment is `initiated` 5 minutes ago cancels nothing; `cancel_engagement` then raises `payment_in_progress`; `pay_from_wallet` funds from a wallet balance created by a stranded payment and refuses when short (`not_enough_balance`); partial wallet: wallet 1_000_000, card part 4_250_000, funds with both; `fee_config` changed between `start_payment` and success does not change the engagement's snapshot; `anon`/`authenticated` cannot call `record_card_payment`.
- [ ] **Step 2:** `supabase test db`; expect FAIL.
- [ ] **Step 3:** Write the migration. Lock order users → engagement → payment. `record_card_payment` must be safe to call concurrently for the same reference (second caller blocks on the lock, then sees `succeeded`). Replace `expire_unpaid_engagements` and `cancel_engagement` with `create or replace` in this new migration (do not edit Stage 5's file).
- [ ] **Step 4:** Apply, `supabase test db`, `npm run db:types`, `npm test` (refusals); all PASS.
- [ ] **Step 5:** Commit "Fund hires into escrow from card or wallet".

### Task 4: Start work, cancellation and settlement (migration 3)

**Files:**
- Create: `supabase/migrations/20261113100200_create_settlement.sql`
- Create: `supabase/tests/settlement.test.sql`

**Interfaces:**
- Consumes: Tasks 2 and 3 (`funded` engagements, snapshots, `post_ledger_group`).
- Produces functions:
  - `start_engagement(engagement uuid) returns void` (authenticated creator of the engagement; `funded → in_progress`, sets `started_at`).
  - `cancel_funded_engagement(engagement uuid, fee_notice_seen boolean) returns void` (authenticated; only from `funded`; business caller → price to business wallet, fee kept, `cancelled`/`cancelled_by_business`, requires `fee_notice_seen`; creator caller → fault refund `cancelled`/`cancelled_by_creator`).
  - `settle_engagement(engagement uuid, outcome text, release_kobo bigint, reason text) returns void` (authenticated admin; wraps internal `settle_engagement_internal(engagement, outcome, release_kobo, reason, actor)` which is revoked from all roles and called by Stage 7). `outcome` in `release | refund | split | refund_creator_fault`; allowed from `funded`/`in_progress` only for now; `reason` required (non-blank). Money per spec §3: release part `r` to creator wallet minus `creator fee` (snapshot rate and minimum, never above `r`), remainder to business wallet, business fee kept; fault outcome returns price + fee − sum of `paystack_fee_kobo` over the engagement's payments (ledger line `platform_revenue +(fee − charges)`). Status `accepted` when `r > 0`, else `refunded`; sets `settle_outcome`, `released_kobo`, `refunded_kobo`, `settled_at`. A repeat call raises nothing and writes nothing.

- [ ] **Step 1:** Write `settlement.test.sql` with ₦50,000 funded fixtures (use `record_card_payment` to fund). Tests: start work only by that creator, only from `funded`; `release` → creator wallet 4_750_000, revenue −500_000 total (business fee + creator fee), escrow nets to 0, status `accepted`; `refund` → business wallet 5_000_000, revenue −250_000, `refunded`; `split` with `release_kobo` 2_000_000 → creator fee is 100_000 (5%), creator wallet gets 1_900_000, business wallet gets 3_000_000; `refund_creator_fault` → business wallet = 5_000_000 + 250_000 − paystack_fee; revenue net equals the charge; business cancel from `funded` returns price only; creator cancel returns the fault amount; neither cancels once `in_progress` (refused `engagement_locked`); settle twice → one set of rows; settle by non-admin refused; blank reason refused; `release_kobo` of −1, price + 100, and 100_050 (not whole naira) refused; `release_kobo = price` equals `release`, `0` equals `refund`; every group sums to 0 and `ledger_totals` sums to 0 after all flows; fee snapshot used even after `fee_config` gets a new row with 10%.
- [ ] **Step 2:** `supabase test db`; expect FAIL.
- [ ] **Step 3:** Write the migration (header: the invariants above). Reuse one internal helper for the three money-out shapes so the lines are written once.
- [ ] **Step 4:** Apply, `supabase test db`, `npm run db:types`; PASS.
- [ ] **Step 5:** Commit "Settle escrow atomically and handle cancellations".

### Task 5: Bank accounts and payouts (migration 4)

**Files:**
- Create: `supabase/migrations/20261113100300_create_payouts.sql`
- Create: `supabase/tests/payouts.test.sql`

**Interfaces:**
- Consumes: Task 2 ledger and `fee_config.transfer_fee_tiers`.
- Produces tables: `bank_accounts(id, user_id unique, bank_code, bank_name, last4, account_name, recipient_code, created_at)`; `payouts(id, user_id, amount_kobo, transfer_fee_kobo, status check in ('requested','processing','paid','failed','rejected'), reference text unique null until approval, approved_by, approved_at, decision_reason, paid_at, created_at, updated_at)`. Add the `ledger_entries.payout_id` foreign key. RLS: creators read their own; admins read all; no direct writes.
- Produces functions: `save_bank_account(bank_code text, bank_name text, last4 text, account_name text, recipient_code text) returns void` (authenticated creator); `transfer_fee_for(amount_kobo bigint) returns bigint` (reads the tiers); `request_payout(amount_kobo bigint) returns uuid` (authenticated creator with a saved account; refuses below `min_payout_kobo`, above balance, or when the fee ≥ amount; debits `creator_wallet`, credits `payout_in_flight`, event `payout_requested`); `reject_payout(payout uuid, reason text) returns void` (admin; reason required; only from `requested`; reversing group, event `payout_rejected`); `approve_payout(payout uuid) returns jsonb` (admin; only from `requested`; sets `processing`, approver, time, `reference = 'pit_po_<uuid without dashes>'`; returns `{reference, recipient_code, send_kobo}` where `send_kobo = amount − fee`); `finish_payout(reference text, outcome text, event_key text, payload jsonb) returns text` (service_role; `paid` or `failed`; only from `processing`; failed posts a reversing group re-crediting the wallet; returns `'paid' | 'failed' | 'duplicate' | 'ignored'`; a `failed` after `paid` returns `'ignored'`).
- Paid group: `payout_in_flight +amount`, `paystack −amount` (the transfer sent plus Paystack's charge, which the creator's fee covers, so the platform nets 0; spec §12 example). If Paystack's real charge ever differs from the table, book the difference to `paystack_fees` in a separate group (spec §11 call 5). Keep signs consistent with Task 2.

- [ ] **Step 1:** Write `payouts.test.sql`: request below ₦1,000 refused; above balance refused; fee ≥ amount refused; success debits wallet and lists payout `requested` with no `reference`; two `request_payout` calls whose sum exceeds the balance (second runs after first commits in the same test via sequential calls plus a `for update` assertion) leave the wallet ≥ 0; non-admin cannot approve/reject; approve twice → second raises/does nothing and `approved_at` unchanged; reject returns the amount and sets reason; approve after reject and reject after approve refused; `finish_payout('paid')` once ok, again `'duplicate'`; `finish_payout('failed')` re-credits exactly once; `failed` after `paid` → `'ignored'`, wallet unchanged; admin approval works for a creator whose account is suspended (set `suspended_at` as in the Stage 5 moderation tests); `ledger_totals` sums to 0 throughout; RLS: a creator reads only their own payouts and bank account.
- [ ] **Step 2:** `supabase test db`; expect FAIL.
- [ ] **Step 3:** Write the migration. Never store a full account number.
- [ ] **Step 4:** Apply, `supabase test db`, `npm run db:types`; PASS.
- [ ] **Step 5:** Commit "Add bank accounts and admin-approved payouts".

### Task 6: Notifications for money events (migration 5)

**Files:**
- Create: `supabase/migrations/20261113100400_money_notifications.sql`
- Modify: `src/lib/notifications.ts`, `src/lib/notifications.test.ts`
- Modify: `supabase/tests/notifications.test.sql` (or add `supabase/tests/money_notifications.test.sql`)

**Interfaces:**
- Consumes: existing `notify(person, kind, facts, key)` and the `engagements_notify` pattern.
- Produces: new `notification_kind` values `hire_funded` (to creator), `work_started` (to business), `funded_hire_cancelled` (to the other side), `engagement_settled` (to both, facts: outcome, amounts), `payout_paid`, `payout_failed`, `payout_rejected` (to creator, rejected carries the reason). Triggers on `engagements` and `payouts` status changes; never notify the actor of their own action (follow `engagements_notify`). Add one `describeNotification` case per kind with the link target (`/business/engagements/<id>`, `/jobs/<id>`, `/wallet`).

- [ ] **Step 1:** Failing tests: SQL test per kind (right recipient, none for the actor); TS test per new kind in `notifications.test.ts` asserting title text, link and that unknown kinds still return null.
- [ ] **Step 2:** Run both suites; expect FAIL.
- [ ] **Step 3:** Migration (`alter type ... add value` must be in this separate file from any use) and the TS cases.
- [ ] **Step 4:** Apply, `supabase test db`, `npm run db:types`, `npm test`; PASS.
- [ ] **Step 5:** Commit "Notify people of funding, settlement and payout events".

### Task 7: Reconciliation and audit reads (migration 6)

**Files:**
- Create: `supabase/migrations/20261113100500_create_audit.sql`
- Create: `supabase/tests/audit.test.sql`

**Interfaces:**
- Produces: `reconciliation_runs(id, ran_at, paystack_balance_kobo bigint, expected_cash_kobo bigint, difference_kobo bigint, note text)` (admin reads; written by service_role); `record_reconciliation(paystack_balance_kobo bigint) returns jsonb` (service_role; computes expected cash from `ledger_totals()` per spec §11 call 1 and stores the difference); `admin_engagement_trail(engagement uuid) returns jsonb` (admin only; returns the engagement, its payments, its ledger groups in time order with actor name and reason, and the creator's payouts); `admin_ledger(person uuid, engagement uuid, event_type text, from_date date, to_date date, row_limit int, row_offset int) returns jsonb` (admin only, nulls mean "any", `row_limit` max 200).

- [ ] **Step 1:** Failing tests: `record_reconciliation` with the exact expected balance stores difference 0, with +100 stores 100; non-admin calling `admin_ledger` or `admin_engagement_trail` is refused; the trail of a settled engagement lists funding, settlement groups in time order with actor and reason; filters narrow `admin_ledger`; `row_limit` above 200 is clamped.
- [ ] **Step 2:** `supabase test db`; expect FAIL.
- [ ] **Step 3:** Migration.
- [ ] **Step 4:** Apply, test, `npm run db:types`; PASS.
- [ ] **Step 5:** Commit "Add reconciliation runs and admin audit reads".

### Task 8: Paystack boundary

**Files:**
- Create: `src/lib/paystack.ts`
- Create: `src/lib/paystack.test.ts`

**Interfaces:**
- Produces (each throws `PaystackError` with the HTTP status and Paystack's message, never the key or full account numbers):
  - `isValidSignature(rawBody: string, signature: string | null): boolean` (HMAC SHA-512 hex, `timingSafeEqual`, false for missing or wrong-length signature)
  - `initializeTransaction(input: { email: string; amountKobo: number; reference: string; callbackUrl: string }): Promise<{ authorizationUrl: string }>`
  - `verifyTransaction(reference: string): Promise<{ status: "success" | "failed" | "abandoned" | "pending"; amountKobo: number; feesKobo: number; currency: string; raw: unknown }>`
  - `listBanks(): Promise<{ code: string; name: string }[]>`; `resolveAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }>`; `createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }): Promise<{ recipientCode: string }>`
  - `initiateTransfer(input: { amountKobo: number; recipientCode: string; reference: string; reason: string }): Promise<{ transferCode: string }>`; `verifyTransfer(reference: string): Promise<{ status: "success" | "failed" | "reversed" | "pending" | "not_found"; raw: unknown }>`; `getBalanceKobo(): Promise<number>` (NGN)
- Reads `PAYSTACK_SECRET_KEY`; throws a clear error if missing.

- [ ] **Step 1:** Tests with a stubbed `globalThis.fetch`: `isValidSignature` true for a body signed with a test secret, false for a changed body, null, and a signature of the wrong length; `verifyTransaction` maps Paystack's `data.status`, `data.amount`, `data.fees` correctly (fixture JSON copied from Paystack's docs); a 404 from `verifyTransfer` returns `not_found`; errors never contain the secret key.
- [ ] **Step 2:** Run `node --test src/lib/paystack.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement with `fetch` to `https://api.paystack.co` and `Authorization: Bearer`. Convert only at this edge; keep kobo everywhere (Paystack's amounts are already kobo).
- [ ] **Step 4:** Tests PASS. Smoke check once against the test account: a `node` one-liner calling `getBalanceKobo()` with `--env-file=.env.local` prints a number.
- [ ] **Step 5:** Commit "Add the Paystack boundary module".

### Task 9: Data access, confirmation, webhook and callback

**Files:**
- Create: `src/lib/db/money.ts`, `src/lib/db/payouts.ts`, `src/lib/payments.ts`, `src/lib/payments.test.ts`
- Create: `src/app/api/webhooks/paystack/route.ts`
- Create: `src/app/(portal)/(business)/business/engagements/[id]/pay/return/page.tsx`
- Modify: `src/lib/refusals.ts` if Task 3's list needs more codes

**Interfaces:**
- Consumes: Tasks 3–7 functions, Task 8 module, `createSessionClient`, `createAdminClient`, `refused()`.
- Produces in `db/money.ts`: `startPayment(engagementId, feeNoticeSeen): Promise<Result<{ paymentId: string; reference: string; cardAmountKobo: number; email: string }>>`; `payFromWallet(engagementId, feeNoticeSeen): Promise<Result<null>>`; `recordCardPayment(input: { reference; paidKobo; paystackFeeKobo; eventKey; payload }): Promise<"funded" | "stranded" | "duplicate" | "mismatch">` (admin client); `startEngagement(id)`, `cancelFundedEngagement(id, feeNoticeSeen)`, `settleEngagement(id, outcome, releaseKobo, reason)`; `getWalletBalance(kind)`, `listMyLedger(limit)`, `getEngagementTrail(id)`, `listLedger(filter)`, `recordReconciliation(balanceKobo)`.
- Produces in `db/payouts.ts`: `saveBankAccount`, `getMyBankAccount`, `requestPayout(amountKobo)`, `listMyPayouts`, `listPayoutsForReview`, `approvePayout(id): Promise<Result<{ reference; recipientCode; sendKobo }>>`, `rejectPayout(id, reason)`, `finishPayout(input)` (admin client), `listProcessingPayoutsOlderThan(minutes)`.
- Produces in `payments.ts`: `confirmCardPayment(reference: string): Promise<"funded" | "stranded" | "duplicate" | "mismatch" | "pending" | "failed" | "unknown">` (verifies with Paystack first, then `recordCardPayment`; `unknown` when no such payment); `confirmTransfer(reference: string): Promise<"paid" | "failed" | "duplicate" | "ignored" | "pending" | "unknown">` (verifies with Paystack; failed/reversed only counts when Paystack says so; `not_found` after 15 minutes counts as failed).
- Webhook route: `POST`, reads `await request.text()`, `isValidSignature` else 401, then parses; handles `charge.success` → `confirmCardPayment`, `transfer.success|failed|reversed` → `confirmTransfer`; unknown events and unknown references return 200; builds the event key as `<event>:<data.reference>`.
- Callback page `pay/return?reference=…`: server component; requires the business owner of that engagement; calls `confirmCardPayment`; shows funded / still processing / failed / "payment received, not applied" (stranded) states and links back; skeleton fallback.

- [ ] **Step 1:** Failing `payments.test.ts` with injected fakes for `verifyTransaction` and `recordCardPayment` (pass them as optional second parameter `deps` defaulting to the real ones; one place only): success path records once with Paystack's amount and fee; Paystack says `failed` → `failed`, nothing recorded; amount differing returns `mismatch` from the DB and is passed through; unknown reference → `unknown`; `confirmTransfer` does not call `finishPayout('failed')` when Paystack reports `pending`; `not_found` at 5 minutes → `pending`, at 20 minutes → `failed`.
- [ ] **Step 2:** `node --test src/lib/payments.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the db modules (map errors with `refused`, parse JSON with `src/lib/db/json.ts` helpers like Stage 5), `payments.ts`, the webhook route and the callback page.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run lint`; PASS. Then a local webhook check: write `scripts/sign-webhook.mjs` (reads `.env.local`, signs a JSON body, POSTs to `http://localhost:3030/api/webhooks/paystack`) and confirm: bad signature → 401; good signature for an unknown reference → 200 and no change; the same event twice → second is a no-op.
- [ ] **Step 5:** Commit "Verify payments and transfers and receive Paystack webhooks".

### Task 10: Scheduled money checks

**Files:**
- Create: `src/app/api/cron/money-checks/route.ts`
- Modify: `vercel.json`, `src/app/api/cron/expire-engagements/route.ts` only if the shared `authorised()` helper is extracted (extract to `src/app/api/cron/authorised.ts` if copying it a second time)

**Interfaces:**
- Consumes: `listProcessingPayoutsOlderThan`, `confirmTransfer`, `getBalanceKobo`, `recordReconciliation`.
- Produces: `GET /api/cron/money-checks` (same `CRON_SECRET` bearer rule) returning `{ payoutsChecked, reconciliationDifferenceKobo }`; safe to run twice.

- [ ] **Step 1:** Test the pure part: a small function `stuckPayoutCutoff(now: Date): Date` (15 minutes back) with a test in `payments.test.ts`.
- [ ] **Step 2:** Implement the route; add `{ "path": "/api/cron/money-checks", "schedule": "30 3 * * *" }` to `vercel.json`.
- [ ] **Step 3:** Run it locally with the bearer header: 401 without, 200 with; with the test account it writes one `reconciliation_runs` row.
- [ ] **Step 4:** Commit "Poll stuck payouts and record daily reconciliation".

### Task 11: Business screens

**Files:**
- Modify: `src/lib/portal.ts`, `src/lib/portal.test.ts`, the shell's icon map (find where `NavIcon` is mapped to Lucide, in `src/components/shells/`)
- Modify: `src/app/(portal)/(business)/business/engagements/[id]/pay/page.tsx`, `pay/actions.ts`
- Create: `src/app/(portal)/(business)/business/engagements/[id]/page.tsx`, `.../actions.ts`
- Create: `src/app/(portal)/(business)/business/wallet/page.tsx`
- Create: `src/components/money/ledger-table.tsx`, `src/components/money/fee-notice.tsx` (only if used on two or more screens; otherwise inline)

**Interfaces:**
- Consumes: Task 9 data functions, `feeExample`, `formatNaira`, existing `Callout`, `Button`, `PageHeader`, skeleton components.
- Produces: nav icon `"wallet"` and a Wallet link (`/business/wallet`) for the business role; `payAction(form)` (reads `engagementId` and a required `feeNoticeSeen` checkbox, calls `startPayment`; redirects to `authorizationUrl` from `initializeTransaction`, or when `cardAmountKobo` is 0 calls `payFromWallet` and redirects to the engagement page; callback URL is `${NEXT_PUBLIC_APP_URL}/business/engagements/<id>/pay/return`); `cancelFundedAction(form)`.

- [ ] **Step 1:** Test in `portal.test.ts`: business nav includes Wallet at `/business/wallet`; active-link matching works for it.
- [ ] **Step 2:** Replace the disabled "Pay with Paystack" button with a form: shows price, fee, wallet balance applied, card amount, a required checkbox "I understand the fee isn't refundable if I cancel", and the Stage 5 notices; refuse (inline `FormMessage`) when the checkbox is unticked.
- [ ] **Step 3:** New engagement page: status, amounts (price, fee, creator fee preview), Cancel (funded only; confirmation showing the exact non-refundable fee and the refund) , read-only once `in_progress`; link from the applications list for funded or later hires.
- [ ] **Step 4:** Wallet page: balance, `LedgerTable` of the person's own entries (date, event, amount, reference).
- [ ] **Step 5:** Skeleton fallbacks for all three pages. Run `npm run typecheck && npm run lint && npm test`; PASS. Check pages at 390px in the browser (Task 14 does the full run).
- [ ] **Step 6:** Commit "Add business payment, hire and wallet screens".

### Task 12: Creator screens

**Files:**
- Modify: `src/lib/portal.ts` (+test), shell icon map; `src/app/(portal)/(influencer)/applications/page.tsx` (link hired rows to `/jobs/<engagement id>`)
- Create: `src/app/(portal)/(influencer)/jobs/[id]/page.tsx`, `.../actions.ts`
- Create: `src/app/(portal)/(influencer)/wallet/page.tsx`, `.../actions.ts`, `bank-account-form.tsx`, `payout-form.tsx`
- Create: `src/lib/payout-request.ts` + `payout-request.test.ts`

**Interfaces:**
- Produces: nav Wallet (`/wallet`) for creators; `startWorkAction(form)`, `withdrawAction(form)`; `saveBankAccountAction(form)` (calls `resolveAccount` then `createTransferRecipient`, stores only last four digits); `requestPayoutAction(form)`; pure `parsePayoutAmount(input: string): { ok: true; kobo: number } | { ok: false; error: string }` (whole naira, ≥ ₦1,000) and `payoutPreview(amountKobo: number): { feeKobo: number; receiveKobo: number }` using `transferFee`.

- [ ] **Step 1:** Failing tests for `parsePayoutAmount` ("1000" ok = 100_000; "999", "1,000.50", "abc", "" refused) and `payoutPreview` (matches `transferFee` tiers); nav test for creators.
- [ ] **Step 2:** Job page: what the creator will earn after the 5% fee (use `creatorFee`), status, **Start work** only when `funded` behind a confirmation ("You can't cancel alone once you start"), **Withdraw from this job** only when `funded` (explains the business is refunded in full).
- [ ] **Step 3:** Wallet page: balance, ledger, bank account form (bank select from `listBanks`, account number, shows the resolved name before saving), payout form with the live preview "You will receive ₦X after the ₦Y transfer fee" and a note that an admin approves every payout; payouts list with status and rejection reasons.
- [ ] **Step 4:** Skeletons; typecheck, lint, tests PASS.
- [ ] **Step 5:** Commit "Add creator job, wallet and payout screens".

### Task 13: Admin money screens

**Files:**
- Modify: `src/lib/portal.ts` (+test): admin nav gains Money (`/admin/money`)
- Create under `src/app/(portal)/(admin)/admin/money/`: `page.tsx`, `actions.ts`, `payouts/page.tsx`, `ledger/page.tsx`, `engagements/[id]/page.tsx`, `settle-form.tsx`, `payout-decision.tsx`

**Interfaces:**
- Consumes: `listPayoutsForReview`, `approvePayout`, `rejectPayout`, `initiateTransfer`, `settleEngagement`, `getEngagementTrail`, `listLedger`, reconciliation reads.
- Produces: `approvePayoutAction(form)` (calls `approvePayout`, then `initiateTransfer` with the returned reference; if Paystack rejects the call, leave the payout `processing` for the poller and show the error); `rejectPayoutAction(form)` (reason required); `settleAction(form)` (outcome select, amount for split, reason required, shows the exact split before confirming).

- [ ] **Step 1:** Money home: payouts awaiting approval count, engagements in escrow with Settle controls, latest reconciliation run (difference highlighted when non-zero), links to ledger and payouts.
- [ ] **Step 2:** Payouts page: each row shows creator, masked account (`last4`, bank, account name), amount, fee, amount to send, the creator's recent ledger; Approve / Reject (reason). Decided rows show approver, time, reason, Paystack status.
- [ ] **Step 3:** Ledger page: filters (person, engagement, event type, dates) with 50-row paging and a CSV export link (`ledger/export` route handler returning `text/csv`, admin only, same filters).
- [ ] **Step 4:** Engagement trail page: timeline from `admin_engagement_trail`; assert on screen that business paid = escrow + business fee, and released = creator fee + creator credit, showing a red "does not add up" callout if not.
- [ ] **Step 5:** Skeletons; typecheck, lint, tests PASS.
- [ ] **Step 6:** Commit "Add admin money screens: payouts, settlement and audit".

### Task 14: Integration runs

**Files:**
- Create: `scripts/money-race.mjs` (throwaway-style script, documented in README)

**Interfaces:**
- Consumes: local Supabase via the secret-key client and `.env.local`.

- [ ] **Step 1:** Write the script: seed one funded-ready engagement per scenario (copy the fixture approach from `supabase/tests/applications_rls.test.sql`), then use `Promise.all` to run: `record_card_payment` ×5 with the same reference and event key; ×5 with the same reference and different event keys; `settle_engagement_internal` ×5; `expire_unpaid_engagements` racing `record_card_payment`; `request_payout` ×2 exceeding the balance (as the creator via a signed-in client). Assert exactly one winner per scenario and `ledger_totals()` all sum to 0.
- [ ] **Step 2:** Run it against local Supabase; PASS with the assertions printed.
- [ ] **Step 3:** Browser run with `mcp__claude-in-chrome` on port 3030 using Paystack test card `4084 0840 8408 4081` (any future expiry, CVV `408`): business pays the hire → returns to the app funded → creator starts work → admin settles (release) → creator wallet shows the credit → creator saves a bank account (Paystack test account) and requests a payout → admin approves → Paystack test transfer; then business cancels a second funded hire (fee notice shown, price refunded to wallet) and pays a third hire from wallet balance. Capture 390px screenshots of each new page. If a Paystack test-mode limitation blocks the transfer step (Paystack test transfers may need OTP off or a funded test balance), say so in the final report and finish the payout by posting a locally signed `transfer.success` through `scripts/sign-webhook.mjs`; say which path was taken.
- [ ] **Step 4:** Commit "Add the money race script".

### Task 15: Docs and final verification

**Files:**
- Modify: `CLAUDE.md` (§4 tree gets `payments.ts`, `paystack.ts` already listed; §6 gets a new §6.6 "How the ledger and payouts work" summarising spec §3–§4 and §12; §12 adds the Stage 6 decisions: minimum payout ₦1,000, admin approves every payout, card payments go to escrow, stranded payments land in the business wallet, admin settlement until Stage 7; mark open item 4 decided and open item 9 still open)
- Modify: `docs/PROVIDERS.md` (new "Paystack" section: `src/lib/paystack.ts`, webhook route, callback, Transfer API, how to replace; the cron `money-checks` row), `README.md` (env var, how to test with signed webhooks and `scripts/money-race.mjs`, the Paystack dashboard webhook URL to set after deploy), `docs/TODO.md` (tick Stage 5/6 items this stage finishes: fee notice stored; add: business wallet withdrawal to bank, live OTP-off for transfers, set webhook URL and live keys, legal review before live money, rolling the test key, `paid_out` status unused, transfer fee table re-check, admin payout approval queue alerts in Stage 8)
- Modify: `docs/superpowers/specs/2026-11-13-stage-6-money-design.md`: set status to "approved 2026-11-13"

- [ ] **Step 1:** Make the doc edits above (CLAUDE.md and PROVIDERS.md in the same change as the code, per §2a).
- [ ] **Step 2:** Run the full gate: `npm run lint`, `npm run typecheck`, `npm test`, `supabase test db`, `npm run build`; report each result honestly.
- [ ] **Step 3:** Confirm no secret is committed: `git diff main --stat` and `git grep -n "sk_test_"` return nothing in tracked files.
- [ ] **Step 4:** Commit "Document Stage 6: escrow, wallets and payouts".
- [ ] **Step 5:** Final report to the user: what was verified (and what wasn't, e.g. real webhooks need a public URL), the migration risk ("six new migrations, not pushed to the live project; pushing is a separate step"), and the money/RLS risks.
