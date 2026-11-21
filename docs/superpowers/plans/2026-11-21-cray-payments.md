# Cray Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cray Finance the default provider for card payments, bank-transfer deposits and creator payouts, keep Paystack working behind an admin switch, and keep every CLAUDE.md §6 money rule true on both.

**Architecture:** A new boundary file `src/lib/cray.ts` (the only code that calls Cray) beside the untouched `src/lib/paystack.ts`. Each `payments` and `payouts` row stores the provider it started on; an append-only settings table holds the active provider for new starts. Money stays in Postgres functions (new migrations, never edits of applied ones); `src/lib/payments.ts` keeps the decisions and branches on the row's provider with plain `switch`es.

**Tech Stack:** Next.js App Router + TypeScript strict, Supabase Postgres (plpgsql `security definer`, pgTAP), `node --test`, `node:crypto` (ES256, HMAC-SHA256, AES-256-GCM). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-cray-payments-design.md` — read it first and keep it open. Section references below (§5.3 etc.) point into it.

## Global Constraints

- Read `CLAUDE.md` fully before starting; §2, §2a, §5, §6, §7, §9 bind every task.
- Branch: `cray-payments` (already created; the design is committed). One commit per task, imperative messages, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Schema changes only as **new** files in `supabase/migrations/`, named `20261122HHMMSS_<what>.sql` in task order (e.g. `20261122100000_…`, `…100100_…`). Never edit an applied migration. When you `create or replace` an existing function, start from its **latest** definition: `grep -n "function public.<name>(" supabase/migrations/*.sql` and take the last file.
- Apply migrations locally with `supabase migration up` — **never `supabase db reset`** (it deletes the owner's local accounts). Then `npm run db:types`.
- Run pgTAP with `supabase test db`; node tests with `npm test`; also `npm run lint` and `npm run typecheck` before each commit.
- Integer kobo everywhere inside the app; naira strings only inside `src/lib/cray.ts` (`koboToNaira` / `nairaToKobo`). Never a float in money maths.
- Every new table: RLS on, default deny, explicit policies. Every new function: `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated` then grant only what the spec says.
- Lock order in money functions: the business's / creator's `users` row → engagement → payment → (payout / tracked link).
- User-facing copy never says "Paystack" or "Cray" except the admin pages; use "our payment provider". No unverified statistics. Every new page gets a `PageLoading` skeleton; check new UI at 390px.
- Env vars (server only; add names to `.env.example` in Task 1): `CRAY_BASE_URL`, `CRAY_COLLECTION_API_KEY`, `CRAY_DISBURSEMENT_API_KEY`, `CRAY_WEBHOOK_KEYS`, `CRAY_SIGNING_PRIVATE_KEY`, `CRAY_SIGNING_KEY_ID`, `CRAY_SUBACCOUNT_TOKEN`, `BANK_ACCOUNT_ENCRYPTION_KEY`.
- Cray facts the docs leave open are marked **verify in sandbox** in the spec. Code them as the spec says, keep the mapping in one small function, and list each one in `docs/TODO.md` (Task 15). You cannot reach the sandbox; don't guess beyond the spec.
- **Stop and ask** (do not improvise) if: a spec rule conflicts with existing code, an existing test must be weakened to pass, or a money function's behaviour on the Paystack path would change.
- Never log or return a full account number, an API key, the signing key or the encryption key.
- **Local machine safety:** `.env.production.local` points at the LIVE Supabase project, so a plain `npm run build && npm start` writes to production. Only build with local overrides: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key from supabase status> NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next build`, and serve on port 3100. The owner's dev server runs on 3030: never stop processes you didn't start. Never run `scripts/money-race.mjs` or any SQL against the live database.

## Review Focus

1. **The same deposit webhook delivered twice, or twice at once** → money credited once (`payment_events` key first). Test: Task 6 pgTAP `record_deposit` duplicate; Task 14 race scenario 29.
2. **Disburse times out, then the daily check runs** → re-send with the same `customer_reference`; "duplicate" → `needs_reference`, payout stays `processing`, never failed, wallet never re-credited. Test: Task 10 `confirmTransfer` Cray cases.
3. **Admin flips the switch while a business is mid-checkout** → that payment keeps its provider; return page / webhook still confirm it. Test: Task 4 pgTAP "started payment keeps provider after switch"; Task 14 scenario 33.
4. **A Cray amount with more than two non-zero decimals or a JSON float (`0.95`, `"39.505"`)** → exact kobo or a thrown error, never rounding. Test: Task 1 `nairaToKobo` cases.
5. **Unsigned `payin`/`payout` body claims success, or an unsigned body shaped like a deposit** → nothing moves without a provider requery (card/payout) or a valid hash (deposit). Test: Task 11 webhook handler cases.

---

### Task 1: Cray client core — money conversion, signing, request

**Files:**
- Create: `src/lib/cray.ts`
- Create: `src/lib/cray.test.ts`
- Modify: `.env.example` (add the eight names in Global Constraints, with one-line comments; no values)

**Interfaces:**
- Produces:
  - `class CrayError extends Error { status: number; code: string | null }` — `status` 0 = no answer; `code` = Cray's `code` field when present (e.g. `SIGNATURE_INVALID`, `SCOPE_DENIED`), or our own `"insufficient_balance"` / `"duplicate_reference"` (Task 2).
  - `koboToNaira(kobo: number): string` — `"52500.00"`.
  - `nairaToKobo(value: string | number): number`
  - `canonicalPathWithQuery(pathWithQuery: string): string`
  - `signatureHeader(input: { method: "GET" | "POST"; pathWithQuery: string; body: string; privateKeyPem: string; keyId: string; timestampMs: number; nonce: string }): string`
  - internal `request(scope: "collection" | "disbursement", method: "GET" | "POST", pathWithQuery: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>` (exported only for tests as `__request`)
  - `isCrayConfigured(): boolean` — true when `CRAY_BASE_URL`, both API keys, `CRAY_SIGNING_PRIVATE_KEY`, `CRAY_SIGNING_KEY_ID`, `CRAY_SUBACCOUNT_TOKEN` and `CRAY_WEBHOOK_KEYS` are non-empty.

- [x] **Step 1: Write failing tests** in `src/lib/cray.test.ts` (copy `stubFetch`/env save-restore pattern from `src/lib/paystack.test.ts`):
  - `koboToNaira`: `5_250_000 → "52500.00"`, `5 → "0.05"`, `0` throws, `-1` throws, `1.5` throws.
  - `nairaToKobo`: `"3950.00000000" → 395000`, `"1000.00" → 100000`, `"5000" → 500000`, `0.95 → 95`, `0.05 → 5`, `1 → 100`, `"52500.5" → 5250050`; throws on `"39.505"`, `"-1"`, `"abc"`, `""`, `NaN`, `1e21`, `"1,000"`.
  - `canonicalPathWithQuery("/subaccounts/x/ledger?page=2&currency=NGN") === "/subaccounts/x/ledger?currency=NGN&page=2"`; `"/balance/" → "/balance"`; `"/" → "/"`; `"/balance?search=S%C3%A3o%20Paulo&currency=NGN" → "/balance?currency=NGN&search=S%C3%A3o%20Paulo"`; a `+` is signed as `%2B`.
  - `signatureHeader` with the docs' worked example (POST `/virtual-accounts/create`, body `{"amount":1000,"currency":"NGN"}`, `t=1761132000000`, `n=1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8`): generate a P-256 key pair in the test, assert the header matches `/^t=1761132000000,n=1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8,kid=[^,]+,v1=[A-Za-z0-9+/=]+$/`, and `crypto.verify("sha256", Buffer.from(canonical), { key: publicKey, dsaEncoding: "der" }, sig)` is true where `canonical` is `"POST\n/virtual-accounts/create\n1761132000000\n1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8\n6469249697a442b13fd6384708be6aede58b356f534aee1549b252ef370a3e36"`. Empty-body GET uses hash `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
  - `__request`: sends `Authorization: Bearer <collection key>` for scope collection and the disbursement key for scope disbursement; sends `X-Signature`; the body string sent is byte-identical to the one hashed; each call uses a new nonce; non-2xx → `CrayError` with status and `code`; network failure → status 0 with a message that contains neither key nor URL; a 10+ digit run in an error message is masked to `******1234`; missing env → `CrayError` naming no values; times out after 15 s (`AbortSignal.timeout`).
- [x] **Step 2: Run** `node --test src/lib/cray.test.ts` → FAIL (module missing).
- [x] **Step 3: Implement** in `src/lib/cray.ts`. Header comment in the style of `paystack.ts` (boundary, no retries, what's never logged). `nairaToKobo`: work on the decimal text (`String(value)`; reject exponent forms), split on `.`, allow extra fraction digits only if all zero. `signatureHeader`: `crypto.sign("sha256", Buffer.from(canonical), { key, dsaEncoding: "der" })`, base64. `request`: `JSON.stringify(body)` once, hash and send that string; `t = Date.now()`, `n = crypto.randomUUID()`; accept success when HTTP 2xx and (`status === true` or `"success"` or `success === true`).
- [x] **Step 4: Run** `node --test src/lib/cray.test.ts` → PASS; `npm run typecheck`, `npm run lint` clean.
- [x] **Step 5: Commit** `Add the Cray client core: naira conversion and request signing`.

### Task 2: Cray endpoints and webhook hash

**Files:**
- Modify: `src/lib/cray.ts`, `src/lib/cray.test.ts`

**Interfaces:**
- Consumes: Task 1 `request`, `koboToNaira`, `nairaToKobo`, `CrayError`.
- Produces (all throw `CrayError` on refusal/outage; `raw` must be trimmed by the caller before storing):
  - `initializeCheckout(input: { amountKobo: number; reference: string; email: string; name: string; callbackUrl: string }): Promise<{ checkoutUrl: string }>` — `POST /checkout/initialize`, scope collection, body per spec §5.2 (`feeBearer: "customer"`, `paymentMethods: ["card"]`, `defaultPaymentMethod: "card"`, `token: CRAY_SUBACCOUNT_TOKEN`, `currency: "NGN"`, `amount: koboToNaira(...)`).
  - `queryCheckout(reference: string): Promise<{ status: "success" | "failed" | "abandoned" | "pending"; reference: string; grossKobo: number; feeKobo: number; netKobo: number; currency: string | null; raw: unknown }>` — `GET /checkout/query/{reference}`; map `Successful/Failed/Abandoned` (case-insensitive), else pending; throw if `data.reference` ≠ ours; on success require all three amounts.
  - `createPermanentAccount(input: { reference: string; accountName: string; email: string }): Promise<{ providerAccountId: string; accountNumber: string; bankName: string; accountName: string }>` — `POST /virtual-accounts/create`, Bloc permanent body per spec §5.3.
  - `listBanks(): Promise<{ code: string; name: string }[]>` — `GET /payout/banks`, scope disbursement, `bank_code`/`bank_name`, de-duplicated by code.
  - `validateAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string; refId: string }>` — `POST /payout/accounts/validate`; reject non-10-digit numbers before calling.
  - `disburse(input: { amountKobo: number; reference: string; accountNumber: string; bankCode: string; recipientName: string; refId: string; narration: string }): Promise<{ providerReference: string; status: string }>` — `POST /payout/disburse`. HTTP 400 with `Insufficient balance` → `CrayError` code `"insufficient_balance"`; a refusal whose message matches `/duplicate|already (been )?used|exists/i` → code `"duplicate_reference"`.
  - `requeryPayout(providerReference: string): Promise<{ status: "success" | "failed" | "reversed" | "pending"; merchantReference: string | null; sentKobo: number; chargeKobo: number | null; raw: unknown }>` — `GET /payout/requery/{id}`; status map in one function `payoutStatus(text)`: `approved|successful|success → success`, `failed|declined → failed`, `reversed → reversed`, else pending (log an unknown string once with `console.error("cray payout status unknown", text)`).
  - `getBalances(): Promise<{ totalKobo: number; parts: { name: string; kobo: number }[] }>` — `GET /balance?currency=NGN`; accept `data` as array or `{ accounts: [] }`; per NGN account use `actual_balance`, else `available_balance + locked_balance`; `totalKobo` = sum.
  - `getMainBalanceKobo(): Promise<number | null>` — the part whose name matches `/main/i`, else null.
  - `isValidWebhookHash(data: unknown, hash: unknown, keyHint: string | null): boolean` — keys from `CRAY_WEBHOOK_KEYS` (comma-separated, ≤ 2); pick by last 4 chars = `keyHint`, else try each; `base64(HMAC-SHA256(serialised data, key))`, constant-time compare; try `JSON.stringify(data)` and, if that fails, the PHP-escaped variant (`/` → `\/`, non-ASCII → `\uXXXX`).

- [x] **Step 1: Write failing tests** — for each function: the exact path, method, scope key and body sent (amounts as naira strings), the parsed result, and one refusal case. Specifically: `disburse` maps the 400 insufficient-balance body to `code === "insufficient_balance"` and a duplicate refusal to `"duplicate_reference"`; `queryCheckout` throws when `data.reference` differs; `getBalances` sums `[{name:"Main Balance",actual_balance:50000},{name:"Settlement Balance",available_balance:1200,locked_balance:0}]` to `5_120_000` kobo for both response shapes; `isValidWebhookHash` true for a hash made with key `k_test_abcd` and hint `abcd`, false for a changed field, false with no keys configured, true for the PHP-escaped variant of `{"return_url":"https://x.test/a"}`.
- [x] **Step 2: Run** `node --test src/lib/cray.test.ts` → new tests FAIL.
- [x] **Step 3: Implement** the functions above.
- [x] **Step 4: Run** tests → PASS; typecheck, lint.
- [x] **Step 5: Commit** `Add Cray checkout, accounts, payouts, balance and webhook hash calls`.

### Task 3: Bank account number encryption

**Files:**
- Create: `src/lib/account-crypto.ts`, `src/lib/account-crypto.test.ts`

**Interfaces:**
- Produces: `encryptAccountNumber(plain: string): string` (format `v1:<iv b64>:<tag b64>:<ciphertext b64>`), `decryptAccountNumber(stored: string): string`, `class AccountCryptoError extends Error` (message never contains the input). Key: `BANK_ACCOUNT_ENCRYPTION_KEY`, base64 of exactly 32 bytes; AES-256-GCM; random 12-byte IV.

- [x] **Step 1: Write failing tests:** round trip of `"0123456789"`; two encryptions of the same number differ; a flipped ciphertext byte → `AccountCryptoError`; a different key → `AccountCryptoError`; `"v2:..."`, `"garbage"` → `AccountCryptoError`; missing or 16-byte key → `AccountCryptoError`; `encryptAccountNumber("12345")` (not 10 digits) throws; no error message includes `0123456789`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `Encrypt creators' full bank account numbers at rest`.

### Task 4: Provider switch, ledger accounts, and provider-stamped card payments (SQL)

**Files:**
- Create: `supabase/migrations/20261122100000_payment_provider.sql`
- Create: `supabase/tests/payment_provider.test.sql`
- Modify: `src/lib/db/money.ts` (wrappers), `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces (SQL):
  - table `payment_provider_settings` (spec §5.1), seeded `('cray', 'Default since 2026-11-21', null)`; RLS: admins select; no direct writes.
  - `active_payment_provider() returns text` (grant authenticated, service_role).
  - `set_payment_provider(provider text, reason text) returns void` — admin only (`current_user_id()` + role check inside), reason 3–500 chars after trim, refuses an unknown provider and a no-op switch (`'already_active'`).
  - Ledger: widen the account check to add `cray`, `cray_fees`, `bank`; widen the event-type check to add `deposit_received`, `processor_fee`, `cash_moved`, `payout_reversed`. Update every place that lists accounts (e.g. the `unnest(array['paystack', …])` in the ledger migration's checks) via `create or replace`.
  - `payments.provider text not null default 'paystack'` and `payments.method text not null default 'card'` (checks: provider in (`paystack`,`cray`); method in (`card`,`transfer`)), backfilled.
  - `start_payment(engagement uuid, fee_notice_seen boolean, method text default 'card')` — drop/recreate keeping the old two-arg call working (same grants); stamps `provider = active_payment_provider()`; refuses `method = 'transfer'` unless the active provider is `cray` (`'transfer_not_available'`); returns the existing jsonb plus `provider` and `method`.
  - `record_card_payment(...)` — same signature; posts cash to the payment's provider account (`paystack` | `cray`) and the charge group to `paystack_fees` + event `paystack_fee` for Paystack, or `cray_fees` + event `processor_fee` for Cray (skip the fee group when the charge is 0).
- Produces (TS, `src/lib/db/money.ts`): `getActivePaymentProvider(): Promise<"cray" | "paystack">`, `setPaymentProvider(provider: "cray" | "paystack", reason: string): Promise<{ ok: true } | { ok: false; reason: string }>`, `listPaymentProviderHistory(limit = 20): Promise<{ provider: string; reason: string; changedBy: string | null; createdAt: string }[]>`, `startPayment(engagementId: string, feeNoticeSeen: boolean, method: "card" | "transfer" = "card")` (result value gains `provider` and `method`).

- [x] **Step 1: Write failing pgTAP** `payment_provider.test.sql`: seed row makes `active_payment_provider() = 'cray'`; non-admin `set_payment_provider` refused; admin switch writes a row and changes the result; short reason refused; unknown provider refused; switching to the active one refused; no role can insert/update/delete the table directly; a payment started under `cray`, then a switch to `paystack`, keeps `provider = 'cray'` and `record_card_payment` for it posts to `cray` (Review Focus 3); a Paystack payment still posts to `paystack` + `paystack_fees` exactly as before; a Cray payment with charge 0 writes no fee group; `start_payment(..., 'transfer')` refused when active is `paystack`; the ledger accepts the new accounts/events and still refuses an unknown one; every group balances.
- [x] **Step 2: Run** `supabase test db` → the new file FAILS (functions missing).
- [x] **Step 3: Write the migration**, then `supabase migration up && supabase test db`; iterate until **all** pgTAP files pass (existing ones untouched).
- [x] **Step 4:** `npm run db:types`; add the TS wrappers; `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Add the payment provider switch and stamp each payment with its provider`.

### Task 5: Fees per provider

**Files:**
- Create: `supabase/migrations/20261122100100_provider_fees.sql`
- Modify: `src/lib/fees.ts`, `src/lib/fees.test.ts`, `src/lib/fee-config.test.ts`, `supabase/tests/payment_provider.test.sql` (or a new `provider_fees.test.sql`)

**Interfaces:**
- Produces (SQL): `fee_config.provider_fees jsonb not null default '{}'` and a **new** `fee_config` row (copy of the latest row) whose `provider_fees` is the spec §5.7 JSON with Cray `card {rate_bps:150, cap_kobo:200000}`, `transfer_in {rate_bps:100, cap_kobo:20000, allowance_kobo:20000}`, `payout {tiers:[{up_to_kobo:null, fee_kobo:5000}], stamp_duty_kobo:0, stamp_duty_from_kobo:0}`; Paystack entry mirrors the existing columns. Seed as one JSON literal (same pattern as the original seed) so the TS test can read it. Functions that read "the latest fee_config" keep working.
- Produces (TS `fees.ts`): `CRAY_FEES` constant equal to that JSON, `TRANSFER_IN_ALLOWANCE_KOBO = 20_000`, `payoutTransferFee(provider: "cray" | "paystack", amountKobo: number): number` (Paystack → existing `transferFee`), `crayCardCharge(kobo: number): number` and `crayTransferInCharge(kobo: number): number` (estimates for display/tests only).

- [x] **Step 1: Failing tests:** `fee-config.test.ts` asserts the new seed's `provider_fees.cray` deep-equals `CRAY_FEES`; `payoutTransferFee("cray", 1_000_000) === 5000`; `payoutTransferFee("paystack", x) === transferFee(x)` for the tier edges; `crayTransferInCharge(5_250_000) === 20_000` (cap) and `crayTransferInCharge(1_000_000) === 10_000`; the existing Paystack invariant test still passes unchanged.
- [x] **Step 2–4:** run → fail; implement migration + TS; `supabase migration up`, `supabase test db`, `npm test` → pass.
- [x] **Step 5: Commit** `Add per-provider processor fees to fee_config`.

### Task 6: Transfer accounts and deposits (SQL)

**Files:**
- Create: `supabase/migrations/20261122100200_deposits.sql`, `supabase/tests/deposits.test.sql`
- Modify: `src/lib/db/money.ts`, `src/types/database.ts`

**Interfaces:**
- Produces (SQL):
  - table `deposit_accounts` (spec §5.3; `account_number`, `provider_account_id`, `bank_name`, `account_name` nullable until completed; unique `(user_id, provider)`; RLS: owner business selects own completed row, admins all).
  - `deposit_account_reference(user_id uuid, provider text) returns text` — service role; returns the existing row's reference or inserts a pending row with `pit_va_<32 hex>`; refuses non-business users.
  - `complete_deposit_account(reference text, provider_account_id text, account_number text, bank_name text, account_name text) returns void` — service role; sets once (same values again is a no-op; different values → `'deposit_account_conflict'`).
  - `record_deposit(provider text, account_reference text, account_number text, deposit_reference text, gross_kobo bigint, charge_kobo bigint, event_key text, payload jsonb) returns jsonb` — service role; steps 1–6 of spec §5.3 exactly; returns `{ outcome: 'funded'|'funded_with_extra'|'short'|'hire_ended'|'credited'|'duplicate'|'unknown_account', business_user_id, engagement_id, credited_kobo, still_needed_kobo, wallet_after_kobo }`. Ledger: one `deposit_received` group (`<provider>` `+net`, `business_wallet` `−net`), net = gross − charge, refuse `charge > gross` or `gross <= 0`. Funding reuses the wallet-funding internals (extract a private helper from `pay_from_wallet` if needed — the fee-notice time comes from the transfer payment row) and closes the transfer payment `succeeded` with `paystack_fee_kobo = 0`. `still_needed_kobo` = remaining total for the first uncovered payment (the ₦200 allowance is added by the UI, not stored).
  - Notification: a `deposit_received` row to the business with facts `{amount_sent_kobo, charge_kobo, credited_kobo, outcome, engagement_id, engagement_title, still_needed_kobo, wallet_after_kobo}`, written inside `record_deposit` via the existing `notify()` (not for `duplicate`/`unknown_account`).
- Produces (TS `money.ts`): `getDepositAccountReference(userId: string): Promise<string>`, `completeDepositAccount(input: { reference: string; providerAccountId: string; accountNumber: string; bankName: string; accountName: string }): Promise<void>`, `getMyDepositAccount(): Promise<{ accountNumber: string; bankName: string; accountName: string } | null>`, `recordDeposit(input: { provider: "cray"; accountReference: string; accountNumber: string; depositReference: string; grossKobo: number; chargeKobo: number; eventKey: string; payload: Json }): Promise<DepositOutcome>` with `type DepositOutcome = { outcome: "funded" | "funded_with_extra" | "short" | "hire_ended" | "credited" | "duplicate" | "unknown_account"; stillNeededKobo: number | null }`.

- [x] **Step 1: Failing pgTAP** `deposits.test.sql` (fixtures like `funding.test.sql`): exact deposit of total+₦200 with charge ₦200 → `funded`, hire `funded`, escrow = price, revenue = fee, wallet 0; ₦60,000 gross/₦200 charge for a ₦52,500 total → `funded_with_extra`, wallet ₦7,300; ₦40,000/₦200 → `short` with `still_needed_kobo = 5_250_000 − 3_980_000 = 1_270_000`, wallet ₦39,800, hire still `awaiting_payment`; a second ₦12,900/₦200 deposit then funds it (`funded`); deposit with no transfer payment → `credited`; deposit after the hire lapsed → `hire_ended`, money in wallet; a hire awaiting payment with only a **card** payment started is not funded by a deposit; same `event_key` twice → `duplicate`, one group only (Review Focus 1); wrong account number for the reference → `unknown_account`, nothing written; `charge > gross` refused; two transfer payments, wallet covers only the older → older funded, newer reported short; `authenticated` cannot call any of the three functions; a creator-fault refund (`withdraw_from_engagement` after starting) on a deposit-funded hire returns price + business fee to the business wallet with nothing left in escrow and nothing in `cray_fees` (spec §5.7 fee test); RLS: a business sees only its own `deposit_accounts` row; a notification row exists per outcome with the facts above; every group balances; wallet never negative.
- [x] **Step 2–4:** migration → `supabase migration up` → `supabase test db` all green → `npm run db:types` → wrappers → `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Credit bank-transfer deposits to the business wallet and fund waiting hires`.

### Task 7: Bank accounts and payouts per provider (SQL)

**Files:**
- Create: `supabase/migrations/20261122100300_provider_payouts.sql`, `supabase/tests/provider_payouts.test.sql`
- Modify: `src/lib/db/payouts.ts`, `src/types/database.ts`

**Interfaces:**
- Produces (SQL):
  - `bank_accounts`: add `provider` (backfill `paystack`), `account_number_encrypted text`; drop `unique(user_id)`, add `unique(user_id, provider)`; `recipient_code` nullable; check: paystack ⇒ recipient_code not null; cray ⇒ account_number_encrypted like `'v1:%'`.
  - `save_cray_bank_account_for(user_id uuid, bank_code text, bank_name text, last4 text, account_name text, account_number_encrypted text) returns void` — service role, upsert on `(user_id, 'cray')`. Paystack's `save_bank_account_for` keeps working for `(user_id, 'paystack')`.
  - `payouts`: add `provider` (backfill `paystack`), `bank_code text`, `account_number_encrypted text`, `provider_reference text unique`, `waiting_for_funds boolean not null default false`, `needs_reference boolean not null default false`, `sent_kobo bigint`, `provider_charge_kobo bigint`; status check adds `'reversed'`; recipient_code nullable with the same provider check.
  - `request_payout(amount_kobo bigint)` — snapshots the bank account for `active_payment_provider()` (refuse `'no_bank_account'` if none) and the transfer fee from `provider_fees` of the latest config for that provider (Paystack: unchanged numbers).
  - `approve_payout(payout uuid)` returns its existing jsonb plus `provider`, `bank_code`, `account_number_encrypted`, `account_name`, `send_kobo` (= amount − transfer fee).
  - `record_payout_send(reference text, provider_reference text) returns text` — service role; sets `provider_reference` once, clears both flags; same value again → `'already_set'`; a different one → `'conflict'`.
  - `flag_payout(reference text, flag text) returns void` — service role; flag in (`waiting_for_funds`,`needs_reference`); only on `processing` Cray payouts.
  - `attach_payout_reference(payout uuid, provider_reference text) returns void` — admin only; only when `provider_reference` is null and the payout is a `processing` Cray payout; records who and when in new columns `reference_attached_by uuid` and `reference_attached_at timestamptz`; clears `needs_reference`.
  - `finish_payout(reference text, outcome text, event_key text, payload jsonb, sent_kobo bigint default null, charge_kobo bigint default null)` — new overload replacing the 4-arg one (keep the 4-arg as a wrapper calling it with nulls, same grants). Posts to the payout's provider cash account. On Cray `paid`: cash out = `sent_kobo + charge_kobo`; if that ≠ `amount_kobo`, book the difference to `cray_fees` in the same group (spec §5.6). New outcome `'reversed'`: only for a Cray payout currently `paid`; status → `reversed`; group `payout_reversed`: `cray +sent_kobo` (+ charge if `charge_kobo` given as returned), `creator_wallet −same`; notification `payout_reversed` to the creator (facts: amount_kobo, credited_kobo); a repeat → `duplicate`. `failed` after `paid` on Paystack stays `ignored` (unchanged).
- Produces (TS `payouts.ts`): `saveCrayBankAccount(input: { userId: string; bankCode: string; bankName: string; last4: string; accountName: string; accountNumberEncrypted: string }): Promise<void>`; `getMyBankAccount(provider: "cray" | "paystack"): Promise<BankAccount | null>`; `approvePayout` result type gains `provider`, `bankCode`, `accountNumberEncrypted`, `accountName`, `sendKobo`; `recordPayoutSend(reference: string, providerReference: string): Promise<"set" | "already_set" | "conflict">`; `flagPayout(reference: string, flag: "waiting_for_funds" | "needs_reference"): Promise<void>`; `attachPayoutReference(payoutId: string, providerReference: string): Promise<{ ok: true } | { ok: false; reason: string }>`; `getPayoutByReference` result gains `provider`, `providerReference`, `sendKobo`; `getPayoutByProviderReference(providerReference: string)` same shape; `finishPayout` input gains optional `sentKobo`, `chargeKobo` and outcome `"reversed"`, result gains `"reversed"`.

- [x] **Step 1: Failing pgTAP** `provider_payouts.test.sql`: a creator can hold one Paystack and one Cray bank row; a Cray row without `v1:` ciphertext refused; with Cray active, `request_payout` snapshots the Cray row and fee ₦50, refuses with only a Paystack row; approval returns `send_kobo = amount − 5000` and the ciphertext; `record_payout_send` set once / already_set / conflict; `flag_payout` refused on Paystack and on non-processing; `attach_payout_reference` admin-only, refused when already set; `finish_payout` paid on Cray with `sent+charge = amount` posts one balanced group to `cray`; with charge ₦30 instead of ₦50 books −₦20 to `cray_fees` in the same group, ledger balances; `reversed` after `paid` re-credits the wallet by `sent_kobo`, status `reversed`, notification written, a second `reversed` is `duplicate`; `reversed` on a Paystack payout is `ignored`; old 4-arg `finish_payout` behaves exactly as before on Paystack (re-run the key assertions); grants: none of the service-role functions callable by `authenticated`.
- [x] **Step 2–4:** migration → `supabase migration up` → `supabase test db` all green (existing `payouts.test.sql` must pass unedited) → `npm run db:types` → wrappers → `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Send payouts through the provider they were requested on`.

### Task 8: Cash movements and per-provider reconciliation (SQL)

**Files:**
- Create: `supabase/migrations/20261122100400_cash_and_reconciliation.sql`, `supabase/tests/cash_reconciliation.test.sql`
- Modify: `src/lib/db/money.ts`, `src/types/database.ts`

**Interfaces:**
- Produces (SQL): `record_cash_movement(from_account text, to_account text, amount_kobo bigint, reason text) returns uuid` — admin only, accounts in (`paystack`,`cray`,`bank`), from ≠ to, amount > 0, reason 3–500; one `cash_moved` group (`to +amount`, `from −amount`). `reconciliation_runs.provider text not null default 'paystack'`; `record_reconciliation(provider text, balance_kobo bigint, note_parts jsonb default '[]')` — expected = the ledger balance of that provider's cash account (positive sum of its rows); difference and the whole-ledger zero-sum check go into `note` as today, plus the parts (`[{name, kobo}]`) for Cray; keep `record_reconciliation(bigint)` as a wrapper for `'paystack'`.
- Produces (TS): `recordCashMovement(input: { from: "paystack" | "cray" | "bank"; to: "paystack" | "cray" | "bank"; amountKobo: number; reason: string }): Promise<{ ok: true } | { ok: false; reason: string }>`; `recordReconciliation(provider: "cray" | "paystack", balanceKobo: number, parts?: { name: string; kobo: number }[])`; `getLatestReconciliation(provider: "cray" | "paystack")`; `listReconciliationRuns` rows gain `provider`.

- [x] **Step 1: Failing pgTAP:** admin cash movement balanced, non-admin refused, same-account refused, `paystack → cray` of ₦100,000 changes both expected cash figures; `record_reconciliation('cray', X)` compares against `cray` only; a Paystack run is unaffected by Cray rows; append-only still holds.
- [x] **Step 2–4:** as before; existing `audit.test.sql` passes unedited.
- [x] **Step 5: Commit** `Reconcile each payment provider on its own and record cash moved between them`.

### Task 9: Notification and ledger words

**Files:**
- Modify: `src/lib/notifications.ts`, `src/lib/notifications.test.ts`, `src/lib/notification-email.ts`, `src/lib/notification-email.test.ts`, `src/lib/ledger-words.ts`, `src/lib/ledger-words.test.ts`, `src/lib/ledger-filter.ts`, `src/lib/ledger-csv.ts`, `src/lib/trail-check.ts` (and their tests)

**Interfaces:**
- Consumes: notification facts from Task 6 and Task 7; accounts/events from Task 4.
- Produces: `describeNotification` cases `deposit_received` (five outcome wordings, exact copy from spec §5.3 "Notifications", amounts via `formatNaira`; the short case says "₦12,700 is still to pay" (`still_needed_kobo`) and adds "Send ₦12,900 by bank transfer to cover the bank charge." (`still_needed_kobo + TRANSFER_IN_ALLOWANCE_KOBO`); href `/business/engagements/<id>/pay` when an engagement is named, else `/business/wallet` — check the real business wallet route) and `payout_reversed` ("Your payout of ₦X didn't arrive. ₦Y is back in your wallet." → `/wallet`); `EMAIL_POLICY.deposit_received = "always"`, `EMAIL_POLICY.payout_reversed = "always"`; ledger words for `deposit_received` ("Bank transfer received"), `processor_fee`, `cash_moved`, `payout_reversed` and the accounts `cray`, `cray_fees`, `bank`; filters, CSV and the trail check accept them.

- [x] **Step 1: Failing tests:** one per wording with the spec's example numbers (₦52,700 / ₦200 / ₦7,300 / ₦12,700 / ₦39,800); email policy for both kinds; ledger words for each new event; trail check still adds up with a deposit-funded hire.
- [x] **Step 2–4:** run → fail → implement → pass.
- [x] **Step 5: Commit** `Word deposit, reversal and Cray ledger rows`.

### Task 10: Payment decisions for Cray (`payments.ts`)

**Files:**
- Modify: `src/lib/payments.ts`, `src/lib/payments.test.ts`

**Interfaces:**
- Consumes: Task 2 Cray functions; Task 4 `recordCardPayment` (unchanged signature); Task 7 payouts wrappers; Task 3 `decryptAccountNumber`.
- Produces:
  - `crayCardFigures(query: { grossKobo: number; feeKobo: number; netKobo: number }, cardPartKobo: number): { paidKobo: number; processorFeeKobo: number; borneBy: "business" | "us" | "mismatch" }` — business bore it when `netKobo === cardPartKobo && grossKobo === cardPartKobo + feeKobo` → `{paid: cardPart, fee: 0}`; we bore it when `grossKobo === cardPartKobo` → `{paid: cardPart, fee: feeKobo}` and `console.error("cray charged us for a card payment; check feeBearer", reference)`; otherwise `{paid: grossKobo, fee: feeKobo, borneBy: "mismatch"}`.
  - `CardDeps` gains `queryCheckout` and `getPaymentProvider(reference: string): Promise<{ provider: "cray" | "paystack"; cardPartKobo: number } | null>`; `confirmCardPayment(reference, deps?)` switches on the stored provider (Paystack path byte-for-byte unchanged); Cray event key `cray.charge:<reference>`.
  - `TransferDeps` gains `requeryPayout`, `validateAccount`, `disburse`, `decryptAccountNumber`, `recordPayoutSend`, `flagPayout`; `confirmTransfer(reference, deps?)` for a Cray payout: no `providerReference` → `sendCrayPayout(payout, d)` (fresh validate → name must match snapshot case/space-insensitively, else return `"name_changed"` and send nothing → disburse → `recordPayoutSend`); `insufficient_balance` → `flagPayout(…, "waiting_for_funds")`, return `"waiting_for_funds"`; `duplicate_reference` → `flagPayout(…, "needs_reference")`, return `"needs_reference"`; with `providerReference` → requery, require `merchantReference === reference` and `sentKobo === payout.sendKobo` (else log, return `"ignored"`), then `finishPayout` with `paid` / `failed` / `reversed` (event keys `cray.payout.<status>:<providerReference>`), passing `sentKobo` and `chargeKobo`. **The 15-minute not-found rule is never applied to Cray.**
  - `export async function sendCrayPayout(payout: { reference: string; bankCode: string; accountNumberEncrypted: string; accountName: string; sendKobo: number }, deps?: TransferDeps): Promise<TransferResult>` (used by the admin approval in Task 13).
  - `TransferResult` adds `"reversed" | "waiting_for_funds" | "needs_reference" | "name_changed" | "sent"`.

- [x] **Step 1: Failing tests** (fakes via `deps`, like the existing ones): `crayCardFigures` three branches; Cray card success → `recordCardPayment` called with `paidKobo = cardPart`, `paystackFeeKobo = 0`, key `cray.charge:pit_…`; Cray pending → `"pending"`; Paystack path tests still pass unchanged; Cray payout without provider ref → disburse called once with `amountKobo = sendKobo` and the decrypted number, `recordPayoutSend` called; validate name mismatch → `"name_changed"`, disburse not called; insufficient balance → `"waiting_for_funds"`, nothing finished; duplicate → `"needs_reference"`, `finishPayout` never called, no re-credit (Review Focus 2); requery success with matching merchant ref → `finishPayout("paid", sentKobo, chargeKobo)`; mismatched merchant ref → `"ignored"`; requery reversed → `finishPayout("reversed")`; a Cray payout "not found" for hours is never failed.
- [x] **Step 2–4:** run → fail → implement → pass; typecheck, lint.
- [x] **Step 5: Commit** `Confirm Cray card payments and payouts against Cray`.

### Task 11: Cray webhook route

**Files:**
- Create: `src/app/api/webhooks/cray/route.ts`, `scripts/sign-cray-webhook.mjs`
- Modify: `src/lib/payments.ts`, `src/lib/payments.test.ts`

**Interfaces:**
- Consumes: Task 2 `isValidWebhookHash`; Task 6 `recordDeposit`; Task 10 `confirmCardPayment`, `confirmTransfer`; Task 7 `getPayoutByProviderReference`.
- Produces: `handleCrayWebhook(rawBody: string, keyHint: string | null, deps?: CrayWebhookDeps): Promise<{ status: number; body: { ok: boolean; result?: string } }>` per spec §5.5: `collection.virtualaccount.successful` → hash required (401 if invalid) → `recordDeposit` with `accountReference = data.customer_reference`, `accountNumber = data.recipient`, `depositReference = data.transaction_reference`, gross/charge from `amount`/`charge` (or gross − net) via `nairaToKobo`, key `cray.deposit:<transaction_reference>`, trimmed payload (no sender account number); `payin` or other `collection.*` with a `pit_[0-9a-f]{32}` in `data.reference` or `data.merchant_reference` → `confirmCardPayment` (pending → 503); `payout` → `getPayoutByProviderReference(data.reference)` → `confirmTransfer(ourReference)`; malformed JSON 400; unknown events 200 `ignored`; `CrayError` 400/404 → 200 `not_verified`; other errors → 500. Route: raw text in, header `cray-webhook-key`, `sendEmailsAfterResponse()` after a 200. Script: `node scripts/sign-cray-webhook.mjs <event> <data.json>` prints a signed body using `CRAY_WEBHOOK_KEYS` from the environment (dev only, like `sign-webhook.mjs`).

- [x] **Step 1: Failing tests** (Review Focus 5): signed deposit → `recordDeposit` once with exact kobo; deposit with a bad hash → 401, `recordDeposit` not called; deposit-shaped body without `hash` → 401; unsigned `payin` claiming success → only `confirmCardPayment(reference)` is called (no money from the body); `payin` with a non-`pit_` reference → 200 ignored; `payout` → `confirmTransfer` with our reference, unknown Cray id → 200 ignored; database outage → 500; pending card → 503.
- [x] **Step 2–4:** run → fail → implement → pass; lint, typecheck.
- [x] **Step 5: Commit** `Receive Cray webhooks`.

### Task 12: Business pay flow and wallet

**Files:**
- Modify: `src/app/(portal)/(business)/business/engagements/[id]/pay/actions.ts`, `…/pay/page.tsx` (and its components), `…/pay/return/page.tsx`, `…/pay/return/view.ts`, `…/pay/return/view.test.ts`, the business wallet page (find it: `grep -rl "business_wallet\|getWalletBalance" "src/app/(portal)/(business)"`)
- Create: a small client component for the transfer panel with a copy button (co-located under `pay/`)

**Interfaces:**
- Consumes: `startPayment(…, method)`, `getActivePaymentProvider`, `getDepositAccountReference`, `completeDepositAccount`, `getMyDepositAccount` (Tasks 4, 6); `initializeCheckout`, `createPermanentAccount`, `CrayError`, `isCrayConfigured` (Task 2); `TRANSFER_IN_ALLOWANCE_KOBO` (Task 5).
- Produces: `payAction` handles `method` from the form (`card` | `transfer`); card on Cray → `initializeCheckout` with `callbackUrl = ${SITE_URL}/business/engagements/${id}/pay/return?reference=${reference}`; card on Paystack unchanged; transfer → ensure the deposit account (reference first, then `createPermanentAccount`, retry once with the same reference on `CrayError` status 0, then `completeDepositAccount`; account name `Pitchype – <business name>`) and redirect back to the pay page with `?transfer=1`. Send no BVN (spec §5.3 "BVN — open"); if Cray refuses for a missing BVN, the business sees "Bank transfer isn't available yet; please pay by card" and `console.error("cray permanent account refused", status, code)` — don't build BVN capture. Pay page: when the active provider is Cray, two choices "Pay by card" / "Pay by bank transfer" (one form, a radio or two submit buttons; fee notice required for both); the transfer panel (bank, account number + copy, the returned account name, amount to send = `cardAmountKobo + TRANSFER_IN_ALLOWANCE_KOBO` with the spec's copy). Return page: provider-neutral wording; reads `reference` (and `trxref`). Business wallet page: shows the transfer account if one exists and the new ledger words.

- [ ] **Step 1: Failing tests:** `view.test.ts` — the provider-neutral messages for each `CardPaymentResult` (no "Paystack" in any string). Pure helper `transferAmountToSend(cardPartKobo: number): number` (co-located, tested): `1_250_000 → 1_270_000`.
- [ ] **Step 2–3:** implement; skeletons for any new Suspense boundary.
- [ ] **Step 4:** `npm test`, typecheck, lint; a production build only with the local overrides from Global Constraints (otherwise say you couldn't); reason through the 390px layout.
- [ ] **Step 5: Commit** `Let businesses pay by card or bank transfer through Cray`.

### Task 13: Creator bank details, admin payouts, provider switch and cash movement pages

**Files:**
- Modify: `src/app/(portal)/(influencer)/wallet/actions.ts`, `…/wallet/bank-account-form.tsx`, `…/wallet/page.tsx`
- Modify: `src/app/(portal)/(admin)/admin/money/actions.ts`, `…/money/payouts/page.tsx`, `…/money/payout-decision.tsx`, `…/money/check-payout.tsx`, `…/money/page.tsx`, `…/money/reconciliation/page.tsx`, `…/money/reconciliation-callout.tsx`, `…/money/ledger` filter UI
- Create: `src/app/(portal)/(admin)/admin/money/provider/page.tsx` (+ its form component and `loading`/skeleton), a cash-movement form component on `/admin/money`, an "Attach Cray reference" form component

**Interfaces:**
- Consumes: Tasks 2, 3, 7, 8, 10.
- Produces:
  - Creator wallet: bank form uses `listBanks`/`validateAccount` from the active provider (Cray: `encryptAccountNumber` then `saveCrayBankAccount`; Paystack: unchanged); "Add your bank details again" state when only the other provider's row exists; rate limits from `money-limits.ts` unchanged.
  - Admin approve (Cray payout): `getMainBalanceKobo()` shown beside the payout; on approve, a pre-check `validateAccount` + name match **before** `approvePayout` (refuse with a message on mismatch), then `approvePayout` → `sendCrayPayout` (Task 10); Paystack approval unchanged.
  - "Check with Cray" uses `confirmTransfer`; flags `waiting_for_funds` / `needs_reference` shown with one-line explanations; `attachPayoutReferenceAction(payoutId, providerReference)` (admin, trims, `^[A-Za-z0-9]{6,64}$`).
  - `/admin/money/provider`: current provider, history (`listPaymentProviderHistory`), switch form with required reason; `setPaymentProviderAction` refuses switching to Cray when `!isCrayConfigured()` and to Paystack when `PAYSTACK_SECRET_KEY` is unset (message names the provider, not the variables' values).
  - `recordCashMovementAction` (admin, whole-naira amount via the existing `parseNairaAmount`, reason required, confirm box).
  - Reconciliation pages show the latest run per provider and the parts note for Cray; ledger filter offers the new accounts/events.

- [ ] **Step 1: Failing tests** for any new pure helper (e.g. `namesMatch(a: string, b: string): boolean` in `src/lib/payout-request.ts`: `"JOHN  DOE"` vs `"john doe"` true, `"John Doe"` vs `"Jane Doe"` false).
- [ ] **Step 2–3:** implement; every action authenticates → authorizes → validates → acts (CLAUDE.md §7).
- [ ] **Step 4:** `npm test`, typecheck, lint.
- [ ] **Step 5: Commit** `Run Cray payouts, the provider switch and cash movements from the admin pages`.

### Task 14: Daily money checks and race scenarios

**Files:**
- Modify: `src/lib/money-checks.ts`, `src/lib/money-checks.test.ts`, `src/app/api/cron/money-checks/route.ts`, `src/lib/db/money.ts` (`listInitiatedCrayCardPayments(olderThan: Date, newerThan: Date, limit = 200): Promise<{ reference: string }[]>`), `src/lib/db/payouts.ts` (`listProcessingPayouts(provider)`), `scripts/money-race.mjs`, `scripts/money-race-lib.mjs`

**Interfaces:**
- Consumes: Tasks 2, 8, 10.
- Produces: `runMoneyChecks` adds (a) Cray card poller: `confirmCardPayment` for each Cray card payment `initiated` 10 minutes–7 days old; (b) payouts: Paystack as today (stuck > 15 min); Cray: every `processing` payout (no age cut-off) through `confirmTransfer`; (c) reconciliation: one run per configured provider (`getBalanceKobo` for Paystack, `getBalances` for Cray with parts). `MoneyChecksResult` gains `cardPaymentsChecked`, `cardPaymentsFunded`, `cardPaymentsErrored`, `reconciliations: { provider, ok }[]`; `cronStatus` 500 if any of them errored.
- Race scenarios (append to the list, numbered from 29): `29 same deposit twice at once`, `30 deposit vs lapse`, `31 deposit vs business cancel`, `32 deposit vs card payment for the same hire`, `33 provider switch during start_payment`, `34 two deposits for one hire at once`, `35 payout send record vs payout webhook finish`. Each asserts the existing `invariants()` plus: one deposit group per event key; a hire funded at most once; wallet never negative.

- [ ] **Step 1: Failing tests** in `money-checks.test.ts` with fakes: a Cray card payment found by the poller is confirmed; a Cray processing payout with no age is checked; one provider's balance failure doesn't stop the other's run and makes `cronStatus` 500; with only Paystack configured, no Cray calls.
- [ ] **Step 2–3:** implement; add race scenarios using the existing helpers in `money-race-lib.mjs` (add a `deposit(...)` helper there).
- [ ] **Step 4:** `npm test`; `node scripts/money-race.mjs` → every scenario PASS (needs local Supabase running).
- [ ] **Step 5: Commit** `Poll Cray card payments and payouts daily and race the deposit paths`.

### Task 15: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md` (§2 provider rule, §3 table, §4 layout lines for `cray.ts`, `account-crypto.ts`, `api/webhooks/cray`, §6.1/§6.3/§6.4 Cray economics and top-ups, §6.6 a "Cray" subsection summarising §5 of the spec, §7 encrypted account numbers, §8 the two new notification kinds, §12 decisions of 2026-11-21), `docs/PROVIDERS.md` (new Cray section: every endpoint, env var, dashboard setup, the settlement-to-Main-Balance setting, IP whitelisting off, how to replace; Paystack section marked "kept, not default"), `docs/TODO.md` (spec §10 owner tasks; every **verify in sandbox** item; the column/account rename TODO; the provisional fees)

- [ ] **Step 1:** write the docs changes; keep CLAUDE.md's existing voice and density.
- [ ] **Step 2:** full verification: `npm run lint`, `npm run typecheck`, `npm test`, `supabase test db`, `node scripts/money-race.mjs`; replay every migration from scratch **without** `db reset` (e.g. in a throwaway local database: `createdb`/`psql` against the Supabase Docker Postgres, apply `supabase/migrations/*.sql` in order inside a transaction and roll back) and report the result.
- [ ] **Step 3: Commit** `Document Cray as the default payment provider`.
- [ ] **Step 4:** report: what was built, every test command and its result, what couldn't be verified (sandbox), and any place you deviated from this plan or the spec, with why.
