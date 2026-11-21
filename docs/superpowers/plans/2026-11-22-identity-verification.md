# Identity Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify creators (legal name + NIN + live selfie), unregistered businesses (owner's legal name + BVN + live selfie) and registered businesses (CAC) through Dojah; gate applying, hiring, publishing and payouts on it; screen for sanctions/PEP at the first money event; and use a verified BVN to open Cray bank-transfer accounts.

**Architecture:** A new boundary file `src/lib/dojah.ts` (the only code that calls Dojah). Person checks run in Dojah's hosted widget; Dojah's signed webhook (plus a daily backstop lookup) decides, through one pure decision function. Results, attempts, screenings and the short-lived BVN live in new tables written only by `security definer` functions; gates are added inside the existing database functions.

**Tech Stack:** Next.js App Router + TypeScript strict, Supabase Postgres (plpgsql, pgTAP), `node --test`, `node:crypto` (HMAC-SHA256, AES-256-GCM via the existing `src/lib/account-crypto.ts`), Dojah's widget script `https://widget.dojah.io/widget.js` via `next/script`. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-22-identity-verification-design.md` — read it first and keep it open (section refs §5.3 etc. point into it). It builds on `docs/superpowers/specs/2026-11-21-cray-payments-design.md`, already implemented on this branch's parent.

## Global Constraints

- Read `CLAUDE.md` fully first; §2, §2a, §5, §6.5, §7, §8, §9 bind every task.
- Branch: `identity-verification` (created from `cray-payments`; the design is committed). One commit per task, imperative message, ending with your own accurate `Co-Authored-By:` trailer for the model you are.
- Migrations only as **new** files `supabase/migrations/20261123HHMMSS_<what>.sql`, in task order. When you `create or replace` an existing function, start from its **latest** definition (`grep -n "function public.<name>(" supabase/migrations/*.sql`, take the last file).
- Apply locally with `supabase migration up` — **never `supabase db reset`**. Then `npm run db:types`. Tests: `supabase test db`, `npm test`, `npm run lint`, `npm run typecheck` before each commit.
- The owner's local database has four pre-existing pgTAP failures unrelated to this work (`funding.test.sql` 1, 92, 93 — an append-only trigger enabled as `O`; `settlement.test.sql` 114 — a leftover row). Don't "fix" them; confirm they're the only failures, and prove everything on a from-scratch migration replay in a throwaway database (as the Cray build did) before Task 12.
- **Local machine safety:** `.env.production.local` is the LIVE Supabase project. Build only with local overrides (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local key> NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next build`), serve on 3100; the owner's dev server is on 3030 — never stop processes you didn't start. Never run anything against the live database.
- Every new table: RLS on, default deny. Every new function: `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated`, grants only as stated.
- **Never store, log, return or put in a notification:** a full NIN or BVN (except `identity_secrets`, encrypted, §6.4), a selfie or ID image or its URL, Dojah's full record, a phone number beyond the one request that needs it. Error messages mask runs of 9+ digits. Stored provider payloads are trimmed copies.
- Dojah auth: header `Authorization: <DOJAH_SECRET_KEY>` (no `Bearer`) and `AppId: <DOJAH_APP_ID>`. Base URL from `DOJAH_BASE_URL`.
- Env names (add to `.env.example` in Task 2): `DOJAH_BASE_URL`, `DOJAH_APP_ID`, `DOJAH_SECRET_KEY`, `DOJAH_PUBLIC_KEY`, `DOJAH_WEBHOOK_SECRET`, `DOJAH_WIDGET_ID_NIN`, `DOJAH_WIDGET_ID_BVN`, `IDENTITY_FINGERPRINT_KEY`.
- User-facing copy: plain, the existing "why we ask" voice, no provider names except the privacy line "checked by our identity partner, Dojah", no statistics, neutral wording for screening holds (no tipping off — policy §5.3). Every new page gets a `PageLoading` skeleton; check new UI at 390px.
- Gates never take what is owed: running hires, escrow, wallets and payouts already requested are untouched (CLAUDE.md §6.5).
- Things the spec marks **verify in sandbox**: implement as specified, keep the mapping in one small function, list each in `docs/TODO.md` (Task 12). You can't reach Dojah's or Cray's sandbox.
- **Stop and ask** if a spec rule conflicts with existing code, an existing assertion would have to change (adding fixture rows is fine; changing what an assertion checks is not), or a money function's behaviour would change beyond the gates listed here.

## Review Focus

1. **The same Dojah webhook twice, or the webhook and the daily backstop for one check at once** → one decision, one notification. Test: Task 4 pgTAP duplicate event key; Task 11 race scenario.
2. **A Dojah `Completed` session whose selfie or lookup step failed** → `failed`, never `verified` ("Completed means finished, not passed"). Test: Task 3 `decideIdentityResult` cases.
3. **A NIN/BVN already verified on another account** → `needs_review`, not verified and not rejected. Test: Task 4 pgTAP.
4. **An existing creator with earnings who never verified** requests a payout → refused with `identity_required`, wallet balance unchanged. Test: Task 5 pgTAP.
5. **A full NIN/BVN leaking** into a stored payload, a log line, an error or a notification → never. Test: Task 3 (trimmed event has no `value`, no image URLs) and Task 6 (handler logs captured in tests contain no 11-digit run).

---

### Task 1: Fingerprints and name matching (pure)

**Files:**
- Create: `src/lib/identity-crypto.ts`, `src/lib/identity-crypto.test.ts`, `src/lib/identity-names.ts`, `src/lib/identity-names.test.ts`

**Interfaces:**
- Produces:
  - `identityFingerprint(kind: "NIN" | "BVN", digits: string): string` → `"v1:" + hex(HMAC-SHA256(key, kind + ":" + digits))`; key = base64 `IDENTITY_FINGERPRINT_KEY` (exactly 32 bytes); throws `IdentityCryptoError` (message never contains the digits) when the key is missing/short or `digits` isn't exactly 11 digits.
  - `lastThree(digits: string): string`.
  - `normaliseName(value: string): string` (upper-case, diacritics stripped via NFD, punctuation → space, spaces collapsed, trimmed).
  - `personNamesMatch(entered: string, onRecord: string): boolean` — spec §5.4 person rule (entered first and last tokens both among the record's tokens, any order).
  - `companyNamesMatch(entered: string, onRecord: string): boolean` — spec §5.4 company rule (equivalences `LIMITED`=`LTD`, `ENTERPRISES`=`ENTERPRISE`=`ENT`, `NIGERIA`=`NIG`, `&`=`AND`, `CO`=`COMPANY`, `PLC`; leading `THE` ignored; then equality).

- [x] **Step 1: Failing tests:** fingerprint is stable for the same input, differs for NIN vs BVN of the same digits, differs with another key, starts `v1:`; throws on `"1234"`, on a missing key, on a 16-byte key, and the error message doesn't include the digits. `personNamesMatch("Chidi Okafor", "OKAFOR CHIDI EMEKA") === true`; `("Chídi  Okafor", "CHIDI OKAFOR") === true`; `("Chidi Okafor", "CHIDI OKORO") === false`; `("Chidi", "CHIDI OKAFOR") === false` (needs first and last). `companyNamesMatch("Acme Industries Ltd", "ACME INDUSTRIES LIMITED") === true`; `("The Acme & Co", "ACME AND COMPANY") === true`; `("Acme Foods Ltd", "ACME INDUSTRIES LIMITED") === false`.
- [x] **Step 2:** `node --test src/lib/identity-crypto.test.ts src/lib/identity-names.test.ts` → FAIL.
- [x] **Step 3:** Implement.
- [x] **Step 4:** Run → PASS; typecheck, lint.
- [x] **Step 5: Commit** `Fingerprint ID numbers and match legal names`.

### Task 2: Dojah client

**Files:**
- Create: `src/lib/dojah.ts`, `src/lib/dojah.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces (all throw `DojahError { status: number }` on refusal/outage; 0 = no answer; never carry keys or 9+ digit runs):
  - `type CompanyType = "BUSINESS_NAME" | "COMPANY" | "INCORPORATED_TRUSTEES" | "LIMITED_PARTNERSHIP" | "LIMITED_LIABILITY_PARTNERSHIP"`.
  - `isDojahConfigured(): boolean` (all eight env vars set).
  - `isValidDojahSignature(rawBody: string, signature: string | null): boolean` — hex HMAC-SHA256 of the raw body with `DOJAH_WEBHOOK_SECRET`, constant-time.
  - `lookupCacAdvanced(rcNumber: string, companyType: CompanyType): Promise<{ found: true; companyName: string; companyType: string; status: string | null; registrationNumber: string; directors: string[] } | { found: false }>` — `GET /api/v1/kyc/cac/advance?rc_number=&company_type=`; 404 → `{found:false}`; `directors` = affiliates mapped to `normaliseName(first + " " + last)`; keep only those fields.
  - `getVerification(referenceId: string): Promise<unknown | null>` — `GET /api/v1/kyc/verification?reference_id=`; 404 → null; returns the session object in the same shape the webhook carries (**verify in sandbox**).
  - `screenPerson(input: { name: string; dateOfBirth: string | null; reference: string }): Promise<{ matchCount: number; providerReference: string | null }>` and `screenBusiness(input: { name: string; reference: string })` — `POST /api/v2/aml/screening` with `schema` `"individual"` / `"organization"`, `unique_reference`, `properties.names`, `date_of_birth` as `DD-MM-YYYY`, `nationality: "Nigerian"`, `screening_options: { pep_check: true, sanction: true, adverse_media_check: false }`; `matchCount` = number of results returned.
  - Constants for the browser: `widgetConfig(kind: "NIN" | "BVN"): { appId: string; publicKey: string; widgetId: string }` (server-only function; the page passes the result to the client component).

- [x] **Step 1: Failing tests** (stub `fetch` like `src/lib/cray.test.ts`): headers are `Authorization: <secret>` with no `Bearer` and `AppId`; CAC path/query and parsed result from the docs' sample (`JOHN DOE LIMITED`, affiliate `JOHN MUSA` → `directors: ["JOHN MUSA"]`); CAC 404 → `{found:false}`; 402 and 424 → `DojahError` with that status; screening body exact (schema, options, DOB format) and `matchCount`; signature: valid, tampered body, wrong secret, missing header, different length; an error message with `"22222222222"` in it comes out masked.
- [x] **Step 2–4:** fail → implement → pass; typecheck, lint.
- [x] **Step 5: Commit** `Add the Dojah client`.

### Task 3: Deciding a Dojah session (pure)

**Files:**
- Create: `src/lib/identity.ts`, `src/lib/identity.test.ts`, `src/lib/identity-fixtures.ts` (the docs' sample `kyc_widget` payload, plus variants)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `type IdentityKind = "creator_nin" | "owner_bvn" | "business_cac" | "director_bvn"`.
  - `type FailureReason = "name_mismatch" | "selfie_mismatch" | "id_not_found" | "liveness_failed" | "provider_unavailable" | "duplicate_identity" | "company_not_found" | "company_inactive" | "not_a_director" | "abandoned" | "other"`.
  - `type IdentityDecision = { status: "ongoing" | "pending" | "verified" | "failed" | "abandoned"; reason: FailureReason | null; idType: "NIN" | "BVN" | null; idNumber: string | null; nameOnRecord: string | null; dateOfBirth: string | null; detail: string | null }`.
  - `decideIdentityResult(event: unknown, check: { kind: IdentityKind; legalNameEntered: string }): IdentityDecision` — spec §5.2 step 4 and §5.5: `verification_status` `Ongoing`/`Pending`/`Abandoned` map directly; `Failed` → failed with the reason mapped from the failing step; `Completed` → verified only if top-level `status` is true **and** the government-data step and the selfie/liveness step passed **and** `id_type` matches the kind (NIN for `creator_nin`; BVN for `owner_bvn`/`director_bvn`) **and** `personNamesMatch(legalNameEntered, nameOnRecord)`; otherwise failed with the specific reason. Step key names and status shapes come from the docs' sample; keep their lookup in one helper `stepPassed(event, step)` (**verify in sandbox**).
  - `trimIdentityEvent(event: unknown): Record<string, string | number | boolean | null>` — keeps `reference_id`, `verification_status`, `status`, `id_type`, each step's `status` and `message` (digits masked); drops `value`, every URL, `metadata.ipinfo`, names, DOB, images.
  - `isCompanyActive(status: string | null): boolean` — inactive when the text matches `/inactive|struck|dissolved|wound/i`; null → active (**verify in sandbox**).

- [x] **Step 1: Failing tests:** the docs' sample → `verified` when names match and steps pass; same payload with the selfie step failed → `failed`/`selfie_mismatch` (Review Focus 2); top-level `status: false` with `Completed` → failed; government step failed → `id_not_found`; name differs → `name_mismatch`; `id_type: "BVN"` on a `creator_nin` check → failed `other`; `Pending` → pending; `Abandoned` → abandoned; malformed input → failed `other`, never throws. `trimIdentityEvent(sample)` serialised contains no 11-digit run, no `http`, no first name (Review Focus 5).
- [x] **Step 2–4:** fail → implement → pass.
- [x] **Step 5: Commit** `Decide identity results from Dojah sessions`.

### Task 4: Identity tables and functions (SQL)

**Files:**
- Create: `supabase/migrations/20261123100000_identity_checks.sql`, `supabase/tests/identity_checks.test.sql`
- Create: `src/lib/db/identity.ts`; Modify: `src/types/database.ts`, `src/lib/refusals.ts` (+ test)

**Interfaces:**
- Produces (SQL), all per spec §5.1:
  - tables `identity_checks`, `identity_events (event_key text primary key, received_at)`, `identity_secrets (check_id uuid primary key references identity_checks, bvn_encrypted text not null check like 'v1:%', phone_encrypted text, expires_at timestamptz not null)`, `screenings`; columns per §5.1 plus `counted boolean not null default false` (true once Dojah reported `Completed`/`Failed`/`Pending`, or a CAC lookup was made), `cac_cache jsonb` (company name/type/status/directors, for a 24 h re-compare, §5.4) and `retry_allowed_at timestamptz` on a reset row (or a small `identity_retry_grants` table — builder's choice).
  - notification kinds `identity_verified`, `identity_failed`, `identity_needs_review` (sent from `finish_identity_check`, never for an admin's own action).
  - `start_identity_check(kind text, legal_name text) returns jsonb` (authenticated) → `{reference, check_id, resumed}`; role/kind pairing (`creator_nin` → influencer; `owner_bvn`, `business_cac` → business; `director_bvn` → business with a verified `business_cac`); refuses `already_verified`, `check_in_review` (a `needs_review` or `pending` exists), `attempt_limit` (≥ 3 counted in 24 h or ≥ 5 counted since the last admin grant); resumes a `started` check < 24 h old (same reference, no new row); legal name 3–200 chars after trim.
  - `finish_identity_check(reference text, decision jsonb, event_key text) returns text` (service role) → stores the event key first (`identity_events`; repeat → `'duplicate'`); applies `status`, `reason`, `legal_name_on_record`, `id_last3`, `id_fingerprint`, `date_of_birth`, company fields, `directors`, `failure_detail`, `counted`; a `verified` decision whose fingerprint (or, for `business_cac`, registration number) is already `verified`/`needs_review` on **another** user becomes `needs_review` with `duplicate_identity`; never moves a check out of `verified`/`failed`/`abandoned` (later events → `'ignored'`); returns the resulting status.
  - `identity_verified(person uuid) returns boolean`, `director_verified(person uuid) returns boolean`, `identity_fingerprint_matches(person uuid, kind text, fingerprint text) returns boolean` (service role), `my_identity_checks() returns setof (kind, status, failure_reason, legal_name_on_record, id_last3, company_name_on_record, registration_number, created_at, decided_at)` (authenticated; own rows only; never fingerprint/DOB/directors).
  - Admin (role checked inside, reason 3–500 chars, records `reviewed_by/at/reason`): `review_identity_check(check uuid, outcome text, reason text)` (only `needs_review` → `verified`|`failed`), `allow_identity_retry(person uuid, reason text)`.
  - Screening: `record_screening(person uuid, subject text, trigger text, status text, match_count int, provider_reference text) returns uuid` (service role; `trigger` in `first_payout`, `first_hire`, `admin` — the spec moved the business trigger from first payment to first hire approval in §5.6); `screening_state(person uuid) returns text` (`none`|`clear`|`possible_match`|`error`|`confirmed`, from the latest row and its review); `review_screening(screening uuid, outcome text, reason text)` (admin; `cleared`|`confirmed`).
  - Secrets (service role): `store_identity_secret(check uuid, bvn_encrypted text, phone_encrypted text)`, `take_identity_secret(check uuid) returns jsonb`, `delete_identity_secret(check uuid)`, `purge_identity_secrets() returns int` (expired rows), `abandon_stale_identity_checks() returns int` (`started` > 24 h), `identity_checks_to_poll(max int) returns setof text` (references `started`/`pending`, 30 min–7 days old).
- Produces (TS `src/lib/db/identity.ts`): thin wrappers with camelCase names for each function above (`startIdentityCheck(kind, legalName)`, `finishIdentityCheck(reference, decision, eventKey)`, `isIdentityVerified(userId)`, `getMyIdentityChecks()`, `reviewIdentityCheck(...)`, `allowIdentityRetry(...)`, `recordScreening(...)`, `getScreeningState(userId)`, `reviewScreening(...)`, `storeIdentitySecret(...)`, `takeIdentitySecret(checkId)`, `deleteIdentitySecret(checkId)`, `fingerprintMatches(userId, kind, fingerprint)`, `listIdentityChecksToPoll(max)`, `abandonStaleIdentityChecks()`, `purgeIdentitySecrets()`, `listIdentityReviewQueue()`), returning `{ ok: true, value } | { ok: false, reason }` for user-callable ones like `src/lib/db/money.ts` does. `refusalText` gains `identity_required`, `already_verified`, `check_in_review`, `attempt_limit`, `screening_hold`.

- [x] **Step 1: Failing pgTAP** `identity_checks.test.sql`: role/kind pairing refused both ways; start → `started` row with a `pit_id_` reference; resume returns the same reference; a verified decision → `identity_verified` true; same event key twice → `'duplicate'`, one notification (Review Focus 1); a second user verifying the same fingerprint → `needs_review` `duplicate_identity` (Review Focus 3); same RC number on two businesses → second `needs_review`; a `Completed`-then-late-`Pending` event doesn't undo `verified` (`'ignored'`); caps: 3 counted in 24 h → `attempt_limit`, an uncounted abandoned session doesn't count, admin grant re-opens; `director_bvn` refused without a verified `business_cac`; admin review only from `needs_review` and needs a reason; RLS: a user sees own rows via `my_identity_checks()` and can't select `identity_checks`, `identity_secrets`, `screenings` or `identity_events` directly; an admin can; no client role can call a service-role function; `purge_identity_secrets` removes only expired rows; `screening_state` for each case.
- [x] **Step 2:** `supabase test db` → new file FAILS. **Step 3:** write the migration; `supabase migration up && supabase test db` → green (except the four known local failures). **Step 4:** `npm run db:types`; wrappers; refusal words + test; `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Store identity checks, screenings and their audit trail`.

### Task 5: Gates (SQL)

**Files:**
- Create: `supabase/migrations/20261123100100_identity_gates.sql`, `supabase/tests/identity_gates.test.sql`
- Modify: every existing pgTAP file and `scripts/money-race-lib.mjs` whose fixtures apply, approve, submit campaigns or request payouts (9 pgTAP files reference these functions): add **fixture rows only** — a verified check for each fixture creator/business (and a `clear` screening where a payout approval or hire approval is exercised). No assertion changes.

**Interfaces:**
- Consumes: Task 4.
- Produces: `apply_to_campaign`, `approve_application` raise `identity_required` (P0001) for an unverified caller; `transition_campaign` raises it on `draft → open` and `draft → pending_review` for an unverified owner (not on resume from `paused`, not for admins); `request_payout` raises it for an unverified creator; `approve_payout` raises `screening_hold` unless `screening_state(creator) = 'clear'` (or an admin cleared it). Error lists in each migration header updated.

- Playwright specs under `e2e/` (if any create applications, campaigns or payouts) will now need verified users; you can't run them reliably here — list the affected specs in your final report rather than editing them blind.

- [ ] **Step 1: Failing pgTAP** `identity_gates.test.sql`: each gate refused unverified and allowed verified; an existing creator with a wallet balance and no check → `request_payout` refused, balance unchanged (Review Focus 4); a hire approved before verification existed can still be paid (`start_payment` works); a paused campaign resumes without verification; admin takedown unaffected; `approve_payout` refused for `none`/`possible_match`/`error`, allowed for `clear` and after `cleared`.
- [ ] **Step 2–4:** fail → migration → add fixture rows to the existing files → `supabase test db` all green (bar the four known) → `node scripts/money-race.mjs` all PASS → types, `npm test`, typecheck, lint.
- [ ] **Step 5: Commit** `Require a verified identity to apply, hire, publish and withdraw`.

### Task 6: Dojah webhook, backstop job and notifications

**Files:**
- Modify: `src/lib/identity.ts`, `src/lib/identity.test.ts`, `src/lib/notifications.ts` (+ test), `src/lib/notification-email.ts` (+ test), `vercel.json`
- Create: `src/app/api/webhooks/dojah/route.ts`, `src/app/api/cron/identity-checks/route.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `applyIdentityEvent(event: unknown, deps?: IdentityDeps): Promise<"applied" | "duplicate" | "ignored" | "unknown">` — finds the check by `reference_id`; `decideIdentityResult`; fingerprints and drops `idNumber`; event key `dojah:<reference_id>:<verification_status>`; calls `finishIdentityCheck`; for a verified `director_bvn` also runs the director match (spec §5.8: against the business's stored `directors`, refreshing with `lookupCacAdvanced` if older than 90 days) and, when the check came from the transfer step, `storeIdentitySecret` (encrypt with `encryptAccountNumber`-style AES-GCM: add `encryptSecret`/`decryptSecret` for 11-digit values to `src/lib/account-crypto.ts` rather than a new file). `IdentityDeps` injects the db wrappers, Dojah calls and `now` (same pattern as `src/lib/payments.ts`).
  - `handleDojahWebhook(rawBody: string, signature: string | null, deps?): Promise<{ status: number; body: { ok: boolean; result?: string } }>` — 401 bad signature (checked before parsing), 400 bad JSON, 200 for applied/duplicate/ignored/unknown, 500 on a database outage; after a 200, `sendEmailsAfterResponse()` in the route.
  - `runIdentityChecks(now: Date, deps?): Promise<{ polled: number; applied: number; errored: number; abandoned: number; secretsPurged: number }>` + route (bearer `CRON_SECRET` via `src/app/api/cron/authorised.ts`; 500 if any step errored); `vercel.json` adds `{ "path": "/api/cron/identity-checks", "schedule": "50 3 * * *" }`.
  - Notification words for `identity_verified` ("Your identity is confirmed."), `identity_failed` (reason-specific fix-it line from spec §5.2 step 5), `identity_needs_review` ("We're taking a closer look. This usually takes 1–2 working days.") → href `/account#identity`; all three `EMAIL_POLICY` `"always"`.

- [ ] **Step 1: Failing tests:** signed webhook applies once; bad signature → 401 and nothing called; repeat → `duplicate`; unknown reference → 200; database error → 500; captured `console.error` output in every test contains no 11-digit run (Review Focus 5); `runIdentityChecks` polls, applies, abandons, purges and reports errors; director match passes for an affiliate and fails `not_a_director` otherwise; notification wording per reason.
- [ ] **Step 2–4:** fail → implement → pass; lint, typecheck.
- [ ] **Step 5: Commit** `Receive Dojah results by webhook and a daily backstop`.

### Task 7: Verification pages and onboarding

**Files:**
- Modify: `src/lib/onboarding.ts` (+ test), `src/app/(onboarding)/onboarding/steps.ts`, onboarding routing/actions as needed; `src/app/(portal)/account/page.tsx`
- Create: `src/app/(onboarding)/onboarding/identity/page.tsx` (+ skeleton), `src/components/identity/dojah-widget.tsx` (client), `src/components/identity/identity-panel.tsx` (shared by onboarding and account), `src/components/identity/actions.ts` (server actions)

**Interfaces:**
- Consumes: Tasks 2, 4.
- Produces: step `identity` inserted in `CREATOR_STEPS` after `photo` and in `BUSINESS_STEPS` after `location` (both before `done`), with `STEP_COPY` entries in the "why we ask" style and a "Do this later" link to the next step. Actions (authenticate → role → validate → rate limit with a new `isIdentityStartLimited` limiter, 5/hour, in `src/lib/money-limits.ts` style but its own file `src/lib/identity-limits.ts`): `startPersonCheckAction(kind: "creator_nin" | "owner_bvn" | "director_bvn", form)` → returns `{ reference, widget: widgetConfig(...), prefill: { firstName, lastName } }`; `verifyCacAction(form)` (name, company type select, RC/BN → `startIdentityCheck('business_cac')` → `lookupCacAdvanced` → decide with `companyNamesMatch` + `isCompanyActive` → `finishIdentityCheck`; a corrected name within 24 h re-compares against `cac_cache` without a new lookup). `DojahWidget` loads the script with `next/script`, constructs `Connect` with spec §5.2 step 3 options, `embed: true`, shows "Checking…" on `onSuccess` and calls `router.refresh()`; on script failure shows "Couldn't load the check. Please try again." Business onboarding first asks Registered / Not registered. The account page gets an `#identity` section (status, legal name on record, last 3 digits, date, retry or "next try after …").

- [ ] **Step 1: Failing tests:** `src/lib/onboarding.test.ts` — step order and numbering for both roles include `identity`; a pure `identityPanelState(checks)` helper (co-located, tested) maps check rows to `"none" | "in_progress" | "verified" | "failed" | "review" | "capped"`.
- [ ] **Step 2–3:** implement; privacy line under the form: what's collected, that Dojah checks it, that we keep only the result and the last 3 digits (draft, owner's legal review — note in TODO).
- [ ] **Step 4:** `npm test`, typecheck, lint; local build with overrides; reason through 390px.
- [ ] **Step 5: Commit** `Add identity checks to onboarding and the account page`.

### Task 8: Gate-aware UI and banners

**Files:**
- Modify: the creator campaign page / apply form (find with `grep -rl "applyToCampaign\|apply_to_campaign" "src/app/(portal)"`), the campaign builder submit step, the business applications approve control, the creator wallet payout form, the portal shell (banner)

**Interfaces:**
- Consumes: `isIdentityVerified`, `refusalText("identity_required")`.
- Produces: disabled Apply / Submit for listing / Approve / Request payout buttons with "Confirm your identity first" and a link to `/account#identity` (show why, don't hide — CLAUDE.md §5); a one-line portal banner for unverified creators ("Confirm your identity to apply for campaigns and withdraw your earnings") and businesses ("Confirm your identity to publish campaigns and hire creators"); server actions surface the database's `identity_required` refusal text if reached anyway.

- [ ] **Step 1:** a pure helper `identityBanner(role, verified): string | null` with tests.
- [ ] **Step 2–4:** implement; `npm test`, typecheck, lint.
- [ ] **Step 5: Commit** `Show why unverified people can't apply, hire, publish or withdraw`.

### Task 9: Screening at the first money event and payout approval

**Files:**
- Modify: creator wallet payout request action (`src/app/(portal)/(influencer)/wallet/actions.ts`), business approve action (find `approveApplication` caller), `src/app/(portal)/(admin)/admin/money/payouts/page.tsx`, `…/payout-decision.tsx`, `…/money/actions.ts`
- Create: `src/lib/screening.ts`, `src/lib/screening.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces: `ensureScreened(person: { id: string; role: "business" | "influencer" }, trigger: "first_payout" | "first_hire", deps?): Promise<"clear" | "possible_match" | "error" | "already">` — only when `getScreeningState` is `none`; person data from the verified check (registered business → `screenBusiness(company name)`; otherwise `screenPerson(legal name, DOB)`); `matchCount > 0` → `possible_match`; a `DojahError` → `error`; always records a row. (Note the spec's trigger is the first **hire approval**, `first_hire`, not first payment.) Payout request: after `requestPayout` succeeds → `ensureScreened(..., "first_payout")`; the creator sees the usual "waiting for approval" whatever the result. Approve action: before `approveApplication` → `ensureScreened(..., "first_hire")`; `possible_match` → refuse with the spec's neutral copy (`screening_hold`); `error` → proceed. Admin payouts page: legal name on record beside the bank account name with a warning when `personNamesMatch` fails; approve disabled with the reason while `screening_hold`; "Screen again" action (admin) calls `ensureScreened` with trigger `admin` regardless of state.

- [ ] **Step 1: Failing tests** for `ensureScreened`: already screened → no Dojah call; match → `possible_match` recorded; no match → `clear`; Dojah 424 → `error` recorded; registered business screens the company name, unregistered the owner's name and DOB.
- [ ] **Step 2–4:** fail → implement → pass; typecheck, lint.
- [ ] **Step 5: Commit** `Screen people once at their first payout or hire`.

### Task 10: Admin identity page

**Files:**
- Create: `src/app/(portal)/(admin)/admin/identity/page.tsx` (+ skeleton, components, `actions.ts`)
- Modify: `src/app/(portal)/(admin)/admin/page.tsx` / `queue.tsx` (count + link), admin sidebar group if one lists admin pages

**Interfaces:**
- Consumes: Task 4 (`listIdentityReviewQueue`, `reviewIdentityCheck`, `allowIdentityRetry`, `reviewScreening`), Task 9 (`ensureScreened` for "Screen again").
- Produces: spec §5.9 — three sections (checks in review: duplicate ID or RC/BN only; screenings `possible_match`/`error`; people at the attempt cap), masked facts, Dojah reference, actions with a required reason and a confirm box. `confirmed` screening → link to the existing standing tools (no new enforcement code).

- [ ] **Step 1:** tests for any pure helper you add (e.g. queue grouping).
- [ ] **Step 2–4:** implement; `npm test`, typecheck, lint.
- [ ] **Step 5: Commit** `Add the admin identity review page`.

### Task 11: Bank-transfer accounts with a verified BVN (Cray)

**Files:**
- Modify: `src/lib/cray.ts`, `src/lib/cray.test.ts`, `src/app/(portal)/(business)/business/engagements/[id]/pay/actions.ts`, the pay page and its transfer panel, `src/lib/db/money.ts` (deposit account refusal), `scripts/money-race.mjs`, `scripts/money-race-lib.mjs`
- Create: `supabase/migrations/20261123100200_deposit_account_refusals.sql` (+ pgTAP additions to `supabase/tests/deposits.test.sql`)

**Interfaces:**
- Consumes: Tasks 1, 4, 6.
- Produces:
  - `createPermanentAccount(input: { reference: string; accountName: string; email: string; bvn: string })` — sends `bvn` (11 digits, checked before calling) as Cray requires (`type: "individual"`, `virtual_account_type: "Permanent"`); `createBusinessAccount(input: { fullName: string; bvn: string; rcNumber: string; phone: string; email: string; businessType: CompanyType; businessName: string }): Promise<{ providerAccountId: string; accountNumber: string; bankName: string; accountName: string }>` — `POST /corporate-accounts/create` (spec §5.8). Neither logs or returns the BVN.
  - `deposit_accounts.refused_at timestamptz`, `refusal_code text`, set by `refuse_deposit_account(reference text, code text)` (service role).
  - Pay page transfer path: **unregistered** (verified `owner_bvn`) → "Enter the BVN you verified with" field → `openTransferAccountAction`: `identityFingerprint("BVN", bvn)` → `fingerprintMatches(userId, "owner_bvn", fp)` → `createPermanentAccount` (account name `Pitchype – <business name>`) → `completeDepositAccount`; mismatch → refused, nothing sent. **Registered** (verified `business_cac`) → director step: legal name + contact phone → `startPersonCheckAction("director_bvn")` + widget; `applyIdentityEvent` (Task 6) stores the BVN and phone encrypted; then the server (in the webhook handling, retried by the daily job while the secret lives) calls `createBusinessAccount`, `completeDepositAccount`, `deleteIdentitySecret`; a tier refusal → `refuse_deposit_account` and the page shows "Bank transfer isn't available for registered businesses yet. Please pay by card." **No individual-account fallback** (spec §5.8).
  - Race scenario `36 director webhook twice at once` → one Cray account call recorded, one deposit account.

- [ ] **Step 1: Failing tests:** `createPermanentAccount` body includes `bvn`, rejects a 10-digit BVN before calling; `createBusinessAccount` path and body; `openTransferAccountAction` logic extracted as a pure-ish function with deps (`openOwnerTransferAccount(userId, bvn, deps)`): fingerprint mismatch → no Cray call; match → Cray called once, number never logged; pgTAP: refusal columns set once, refused account shows as refused to its business.
- [ ] **Step 2–4:** fail → implement → pass; `node scripts/money-race.mjs` all PASS; typecheck, lint.
- [ ] **Step 5: Commit** `Open Cray transfer accounts with a verified BVN`.

### Task 12: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md` (§3 table: Dojah; §4 layout: `dojah.ts`, `identity*.ts`, `api/webhooks/dojah`, `api/cron/identity-checks`; §5: identity gates; §7: ID data rules; §8: three new kinds; §12: the 2026-11-22 decisions), `docs/PROVIDERS.md` (Dojah section: endpoints, widget script, env vars, dashboard setup, webhook signature, what Dojah receives as processor, how to replace; Scheduled jobs: identity-checks), `docs/TODO.md` (spec §10 owner tasks, every verify-in-sandbox item, privacy copy legal review, retention schedule)

- [ ] **Step 1:** write the docs in CLAUDE.md's existing voice.
- [ ] **Step 2:** full verification: `npm run lint`, `npm run typecheck`, `npm test`, `supabase test db` (only the four known local failures), from-scratch migration replay in a throwaway database with all pgTAP files green, `node scripts/money-race.mjs`.
- [ ] **Step 3: Commit** `Document identity verification`.
- [ ] **Step 4:** final report: tasks and commit hashes, every command and its result, what you couldn't verify (sandboxes, browser), every deviation from the plan or spec and why, open questions for the owner.
