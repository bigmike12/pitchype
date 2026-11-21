# Identity verification with Dojah (KYC/KYB) — design

Date: 2026-11-22. Status: approved by the owner 2026-11-22 after the builder check.

Sources: the owner's request and decisions in conversation (2026-11-21/22); the draft policy
`docs/legal/aml-data-protection-policy.md` (§4 CDD, §5 monitoring, §6 records, §7 data protection,
§9 gap register); Dojah's docs (https://docs.dojah.io, full text https://docs.dojah.io/llms-full.txt);
the Cray payments design `docs/superpowers/specs/2026-11-21-cray-payments-design.md` and Cray's
answer that a permanent virtual account needs a BVN (§11).

---

## 1. Why

The AML and data-protection policy commits Pitchype to risk-based customer due diligence: identify
creators and businesses before money-related activity, screen for sanctions/PEP where appropriate,
keep only what is necessary, and keep a record of what was checked, how and when (policy §4, §6,
§7). Two gap-register lines (§9: "CAC/business verification", "Creator identity verification") are
what this closes. Separately, Cray will only open a permanent bank-transfer account for a business
against a verified BVN, so verification also unblocks "Pay by bank transfer".

Pitchype is early-stage and every provider call costs money, so the design collects the least it
can, calls providers only when the answer is needed, and never repeats a check without a reason.

## 2. Goals, non-goals, anti-goals

**Goals**
- **Creators:** legal name + NIN + live selfie (Dojah hosted widget). The legal name is separate from
  the public display name and never shown publicly.
- **Registered businesses:** registered business name + company type + CAC (RC/BN) number, checked
  against CAC (Dojah API). The name must match CAC's records.
- **Unregistered businesses:** owner's legal name + BVN + live selfie (Dojah hosted widget).
- **Gates:** an unverified creator can't apply to campaigns; an unverified business can't submit a
  campaign for listing (draft → open / pending_review). Enforced in the database.
- Verification sits in onboarding and is **skippable** ("Do this later"); it can be done or retried
  any time from the account page.
- **Director check at first bank transfer (registered businesses, owner's choice (b)):** a director
  gives legal name + BVN + live selfie; their name must be among the company's directors /
  proprietors on CAC. Only then is the Cray transfer account opened.
- **Sanctions/PEP screening once per person at the first money event** (owner's choice): a creator's
  first payout request; a business's first payment. Afterwards only on risk triggers (not built now).
- **Fingerprints, not ID numbers:** store a keyed HMAC of each NIN/BVN to spot reuse across
  accounts and to match a re-typed BVN, plus the last 3 digits. Never the full number at rest,
  except a BVN held encrypted for the minutes between verification and Cray opening the account.
- Clear statuses, failure reasons, retries with a cap, an admin review queue, an audit trail.

**Non-goals**
- Document upload (CAC certificates, utility bills), address verification, enhanced due diligence
  (Tier 3), tiered monetary limits (policy §4.3 — limits not approved), automated transaction
  monitoring (policy §5.1), re-screening schedules, data-subject-request tooling, a retention/deletion
  job (schedule not yet defined — TODO).
- A public "ID checked" badge (my call: every applicant is checked anyway, and "Verified" already
  means "follower count confirmed by an admin" since Stage 3 — two badges would confuse).
- Verification for admins.

**Anti-goals**
- Storing selfies, ID photos, full NIN/BVN, phone numbers or Dojah's full identity record.
- Trusting the browser's "done" callback for a decision.
- Paying for a check whose answer we already have.
- Taking away what people are already owed: verification never freezes running hires, escrow,
  wallets or payouts already requested (CLAUDE.md §6.5 "suspension is not forfeiture" spirit).
- Wording that tips someone off about a screening match (policy §5.3).

## 3. Constraints

- CLAUDE.md §2/§2a: Dojah is a new provider → one boundary file `src/lib/dojah.ts` (plain `fetch`,
  15 s timeout, no retries, errors never carry keys or ID numbers), a `docs/PROVIDERS.md` section, and
  `.env.example` names. No npm package: the widget is Dojah's script tag
  (`https://widget.dojah.io/widget.js`), loaded only on the verify page via `next/script`
  (`strategy="afterInteractive"`; the docs say no `async`/`defer` on a raw tag — `next/script`
  `onReady` meets that need). No CSP exists today (`next.config.ts` sets no headers), so nothing to
  widen; note it in PROVIDERS.md for when one is added.
- New migrations only; RLS default-deny on every new table; `security definer` functions with
  `search_path = ''`; grants only as stated.
- Env (server only unless noted): `DOJAH_BASE_URL` (`https://sandbox.dojah.io` / `https://api.dojah.io`),
  `DOJAH_APP_ID`, `DOJAH_SECRET_KEY`, `DOJAH_PUBLIC_KEY` (safe for the browser; passed to the client
  component as a prop, not a `NEXT_PUBLIC_` var, so the server decides when it's exposed),
  `DOJAH_WEBHOOK_SECRET`, `DOJAH_WIDGET_ID_NIN`, `DOJAH_WIDGET_ID_BVN`, `IDENTITY_FINGERPRINT_KEY`
  (32 bytes base64), plus the existing `BANK_ACCOUNT_ENCRYPTION_KEY` reused for the short-lived BVN
  (see §6.4).
- Dojah auth header is the secret key **as-is, no `Bearer`**, plus `AppId`.
- Mobile first: the widget is mobile-friendly; our pages around it follow the design system and are
  checked at 390px. Skeleton loading states for new pages.
- Copy: plain, no statistics, no legal claims; the privacy note text is a draft for the owner's
  legal review (TODO).

## 4. Approaches

| | Approach | Trade-off | Decision |
|---|---|---|---|
| **A** | **Dojah hosted widget (EasyOnboard) for NIN/BVN + selfie; Dojah API for CAC** | Real liveness, camera handled on cheap phones, we never touch selfies, least code. Costs: Dojah-styled screens (themed in their dashboard), one external script on one page, result arrives by webhook seconds later, priced per flow. | **Chosen by the owner** |
| B | Our own camera capture + Dojah selfie-match API | Our look, instant result, no script. But the match alone has no liveness; adding it is a second paid call per attempt and weaker (single still); we'd handle selfie images. | Rejected |
| — | Mixing widget selfie with our own lookup for the same check | Two sources of truth for one result. | Rejected |

Other decisions in conversation: selfie match for both creators and unregistered business owners
(owner); registered businesses verify by CAC only, director check at first bank transfer (owner's
(b)); screening at the first money event (owner); fingerprints (owner, after explanation); BVN not
NIN for unregistered businesses (owner, 2026-11-21).

## 5. What gets built

### 5.1 Data

**`identity_checks`** — one row per attempt (append-mostly; status moves forward only):
`id`, `user_id`, `kind` (`creator_nin` | `owner_bvn` | `business_cac` | `director_bvn`),
`status` (`started` | `pending` | `verified` | `failed` | `needs_review` | `abandoned`),
`reference` (ours, `pit_id_<32 hex>`, unique — Dojah's `reference_id`), `provider` (`dojah`),
`provider_session_id` (Dojah's id if given), `legal_name_entered`, `legal_name_on_record` (as Dojah
returned it, upper-cased), `id_last3`, `id_fingerprint` (hex HMAC; null for CAC),
`date_of_birth` (date; only for person checks, kept for screening accuracy — see §5.6),
`company_name_on_record`, `company_type`, `registration_number` (RC/BN; public registry data),
`directors` (jsonb array of upper-cased "FIRST LAST" names from an advanced CAC lookup, only when
fetched), `failure_reason` (`name_mismatch` | `selfie_mismatch` | `id_not_found` | `liveness_failed`
| `provider_unavailable` | `duplicate_identity` | `company_not_found` | `company_inactive` |
`not_a_director` | `abandoned` | `other`), `failure_detail` (short text from Dojah's step message,
scrubbed of numbers), `reviewed_by`, `reviewed_at`, `review_reason`, `created_at`, `decided_at`.
RLS: the user reads their own rows **except** `id_fingerprint`, `date_of_birth`, `directors` (expose
through a view or a function returning the safe columns); admins read all; writes only through
functions.

**`identity_status`** (derived, not stored): a SQL function
`identity_verified(person uuid) returns boolean` — true when the person has a `verified` row of the
kind their role needs (creator: `creator_nin`; business: `owner_bvn` **or** `business_cac`).
`director_verified(business uuid)` — a `verified` `director_bvn` row exists. Admins are always true.

**`identity_secrets`** — the only place a full BVN may sit, and only briefly: `check_id`,
`bvn_encrypted` (`v1:` AES-GCM, same scheme as bank accounts), `expires_at` (24 h). Service-role
only, no RLS read for anyone. Deleted when the Cray account is opened, on expiry by the daily job,
or when the check fails. (See §6.4 for why it exists at all.)

**`screenings`** — one row per screening: `user_id`, `subject` (`person` | `business`), `trigger`
(`first_payout` | `first_payment` | `admin`), `status` (`clear` | `possible_match` | `error`),
`match_count`, `provider_reference`, `reviewed_by`, `reviewed_at`, `review_outcome`
(`cleared` | `confirmed`), `review_reason`, `created_at`. Admin-only read; the person never sees it.

### 5.2 Creator flow (NIN + selfie)

1. Onboarding gets one new step after `photo`, before `done`: **"Confirm it's you"** (`identity`).
   Copy explains why (we verify everyone who's paid through Pitchype; your legal name stays private;
   we don't keep your NIN or selfie), with **"Do this later"** that goes on to `done`.
2. The creator types their **legal name** (first, middle optional, last) in our form. The server
   action (authenticate → role → validate → rate limit) calls
   `start_identity_check(kind 'creator_nin', legal_name)` → returns `reference`. Refused if already
   verified, if a check is `pending`/`needs_review`, or past the attempt cap (§5.7).
3. The page mounts the Dojah widget (client component) with `app_id`, `p_key`, `type: "custom"`,
   `config.widget_id = DOJAH_WIDGET_ID_NIN`, `reference_id = reference`,
   `user_data: {first_name, last_name}` prefilled, `metadata: {reference}`. `onSuccess` only switches
   the page to "Checking…" and refreshes; `onClose` without success leaves the check `started`
   (becomes `abandoned` after 24 h via the daily job or on the next start).
4. **Dojah's signed webhook decides** (§5.5). On a terminal event the server:
   - reads the NIN from the event's top-level `value` (and `id_type` must be `NIN`), computes the
     fingerprint, keeps the last 3 digits, **discards the number**;
   - reads the record's names and date of birth from the government-data step, and the selfie and
     liveness step statuses;
   - decides with `decideIdentityResult()` (pure, unit-tested): verified only if the session's
     overall `status` is true, the government lookup and selfie/liveness steps passed, and the
     **names match** (§5.4); otherwise `failed` with the reason;
   - checks the fingerprint against other users' verified/needs_review checks: a hit →
     `needs_review` with `duplicate_identity` (an admin decides; never auto-reject — policy §4.6).
   - records via `finish_identity_check(...)`.
   `Pending` from Dojah (manual review on their side) → our `pending`; we wait for the next event.
5. The creator is told in-app (notification kinds `identity_verified`, `identity_failed`,
   `identity_needs_review`; emailed `always`). A failure says what to fix in plain words
   (name doesn't match the record → check spelling against your NIN slip; selfie didn't match →
   good light, face the camera; NIN not found → check the number).

### 5.3 Business flows

**Choice in onboarding** (step `identity`, after `location`): "Is your business registered with
CAC?" → Registered / Not registered / Do this later.

**Registered (CAC, API, synchronous):**
- Form: registered business name, company type (select: Business name, Company, Incorporated
  trustees, Limited partnership, Limited liability partnership — Dojah's `company_type` values),
  RC/BN number.
- Server: `start_identity_check('business_cac', name)` → `dojah.lookupCac(rcNumber, companyType)`
  (**advanced** lookup, `/api/v1/kyc/cac/advance` — my call after seeing Dojah's pricing, which is
  cents per call ("as low as $0.06"): one call, one code path, and the directors' names are already
  there for the bank-transfer step, so no second lookup ever) → store the directors' names on the
  check → `finish_identity_check(...)` with: verified if found, active (status text not
  inactive/struck off — **verify the vocabulary in sandbox**), and the company name matches (§5.4);
  else `failed` with `company_not_found` / `company_inactive` / `name_mismatch`. On a mismatch the
  message shows CAC's name (public registry data) so the business can correct a typo.
- `business_profiles.business_name` (public) is untouched; the registered name lives on the check.
- **Duplicate RC/BN (owner, 2026-11-22):** an RC/BN number already `verified` or `needs_review` on
  another account → this check is `needs_review` (`duplicate_identity`) for an admin, not verified.
  CAC alone proves the company exists, not that this person belongs to it; this guard plus the
  existing admin review of a business's first campaign is the accepted mitigation.

**Unregistered (owner BVN + selfie, widget):** exactly the creator flow with kind `owner_bvn`,
`DOJAH_WIDGET_ID_BVN`, `id_type` `BVN`. Additionally, because Cray needs this BVN to open the transfer
account (§5.8), the server stores the BVN encrypted in `identity_secrets` **only if** the business
has already chosen bank transfer in this session; otherwise the number is discarded like a NIN and
the fingerprint is kept (the business re-types it at first transfer — §5.8).

**Director check (registered businesses, at first bank transfer only):** §5.8.

### 5.4 Name matching (pure function, unit-tested)

`namesMatch(entered, onRecord)` for people: normalise both (upper-case, strip diacritics and
punctuation, collapse spaces), split into tokens; match when the entered first and last names both
appear among the record's tokens (order-insensitive; middle names optional either way).
`companyNamesMatch(entered, onRecord)`: normalise as above, then treat `LIMITED`/`LTD`,
`ENTERPRISES`/`ENTERPRISE`/`ENT`, `NIGERIA`/`NIG`, `&`/`AND`, `PLC`, `CO`/`COMPANY` as equal and
ignore a leading `THE`; match on equality after that. Anything fuzzier goes to `failed` with
`name_mismatch`; the person can retry with the exact name (no paid call is wasted on the business
path because the CAC lookup can be compared again without re-calling: cache the CAC answer on the
failed check for 24 h and re-compare a corrected name against it — my call).

### 5.5 Dojah webhook `/api/webhooks/dojah`

- Read the raw body; verify `x-dojah-signature` = hex HMAC-SHA256(raw body, `DOJAH_WEBHOOK_SECRET`),
  constant-time, **before** parsing. Invalid → 401. (IP allowlisting `135.119.89.106` is optional;
  not relied on — Vercel can't filter by source IP cheaply.)
- Only the `kyc_widget` service's events are handled; match `reference_id` to our `pit_id_` check;
  unknown → 200 ignored.
- Idempotent: event key `dojah:<reference_id>:<verification_status>` stored first (reuse
  `payment_events`? No — a new `provider_events` table or a unique column on `identity_checks`
  transitions; builder's choice, but a repeat must write nothing).
- `Ongoing` → nothing. `Pending` → `pending`. `Completed` → decide (§5.2 step 4). `Failed` →
  `failed` with the mapped reason. `Abandoned` → `abandoned`.
- Never store the payload as received: keep a trimmed copy (status fields, step statuses and
  messages, Dojah's ids) with no names beyond what §5.1 keeps, no number, no image URLs.
- Backstop: the daily job asks `GET /api/v1/kyc/verification?reference_id=…` for checks `started` or
  `pending` older than 30 minutes and younger than 7 days (cap 100 per run), and treats the answer
  exactly like a webhook. **Verify in sandbox** that this endpoint returns widget sessions.

### 5.6 Sanctions/PEP screening at the first money event

- **Creator, first payout request:** after `request_payout()` succeeds and the creator has no
  `screenings` row, the server calls `dojah.screenPerson({ name: legal_name_on_record, dateOfBirth,
  nationality: "Nigerian" })` (`POST /api/v2/aml/screening`, `schema: "individual"`, PEP + sanctions
  on; adverse media off — my call, to save cost and noise). Result → `screenings` row.
  The payout stays `requested` either way; **admin approval is blocked** while the creator's latest
  screening is `possible_match` (until an admin clears it) or `error` (an admin can press "Screen
  again"). The creator sees only the usual "waiting for approval".
- **Business, first hire approval** (moved from "first payment" after the builder check: a 1–2
  working-day review would outlast the 48-hour payment deadline; screening before the first approval
  means no hire exists yet, so nothing can lapse): in the approve action before
  `approve_application`, if no `screenings` row: registered → `schema: "organization"` with the CAC
  name; unregistered → the owner's verified name and DOB. `possible_match` → approval refused with
  neutral copy ("We need to review your account before you can hire. This usually takes 1–2 working
  days.") and the admin queue shows it; `error` → the approval proceeds (payments stay protected by
  escrow and payouts stay gated by admin approval) and the admin queue shows it for a manual
  re-screen — my call.
- **Payouts need a verified identity** (owner, 2026-11-22): `request_payout()` raises
  `identity_required` for an unverified creator, existing creators included. Nothing is taken: the
  earnings stay in the wallet, and the wallet page says "Confirm your identity to withdraw" with a
  link. So every creator who reaches the first-payout screening has a verified name and DOB.
- **Screening only, not identity, in Dojah's hosted flows:** the EasyOnboard flows are built
  **without** Dojah's AML step (it would screen every sign-up, the cost the owner chose to avoid);
  screening stays the separate call above.
- Admin decides a match with a written reason: `cleared` (proceed) or `confirmed` (suspend through
  the existing moderation functions and escalate offline per policy §5.2 — no new enforcement code).

### 5.7 Gates, attempts and the UI around them

- **Database gates:** `apply_to_campaign()` raises `identity_required` unless
  `identity_verified(current user)`; `approve_application()` raises `identity_required` for an
  unverified business (owner, 2026-11-22; hires already approved can still be paid); `transition_campaign()` raises `identity_required` on
  `draft → open` and `draft → pending_review` (and on `paused → open`? no — a live campaign stays
  live; my call) unless the owner is verified. Admin takedowns and every money function are
  untouched.
- **Existing accounts:** treated as unverified from launch. Their open campaigns stay listed, their
  running hires and wallets carry on; they just can't apply or submit new campaigns until verified.
  A portal banner ("Confirm your identity to apply for campaigns" / "…to publish campaigns") links to
  the account page. (My call; the owner's rule says unverified can't apply/publish, and nothing
  already agreed is touched.)
- **UI:** Browse campaigns shows the Apply button disabled with "Confirm your identity first" and a
  link (CLAUDE.md §5 asks us to show *why*, not hide); the campaign builder's submit step does the
  same. Account page → "Identity" section: status, the verified legal name (to the person only),
  last 3 digits, date checked, retry button and the next allowed time when capped.
- **Attempts (cost control, my call):** at most **3 paid attempts per person per 24 h and 5 in
  total**; after that the next attempt needs an admin to reset it (`allow_identity_retry(user,
  reason)`). An abandoned widget session that never reached Dojah's checks doesn't count (only
  checks Dojah reports `Completed`/`Failed`/`Pending` count). A CAC name-only correction against the
  cached answer (§5.4) doesn't count.
- **Rate limits:** starting a check uses the existing rate-limit helper (5 per hour per user).

### 5.8 Bank transfer accounts need a BVN (ties to the Cray build)

Cray confirmed: a permanent virtual account requires the holder's **BVN**; a NIN is not accepted.

- **Unregistered business, first "Pay by bank transfer":** the page asks them to type their BVN
  again (one field, with "the same BVN you verified with"). The server fingerprints it; if it equals
  the verified `owner_bvn` fingerprint, it calls Cray `createPermanentAccount` with that BVN
  (individual, Bloc), then discards the number. No Dojah call. Mismatch → refused, nothing sent.
- **Registered business, first "Pay by bank transfer":** a director runs the BVN + selfie widget
  (`kind 'director_bvn'`, legal name entered). On a verified widget result the server runs the
  **advanced CAC lookup** once (if `directors` isn't cached on the business's CAC check), and the
  director's record name must match one of the affiliates stored at sign-up (§5.4 person rule; the
  advanced lookup is re-run only if the stored list is older than 90 days) → else `failed`
  `not_a_director`. Then the server opens the Cray account: **business account**
  (`/corporate-accounts/create`: director full name, BVN, RC number, phone, business type, registered
  name). **No fallback (owner, 2026-11-22):** if our Cray tier can't open business accounts, a
  registered business pays by card only ("Bank transfer isn't available for registered businesses
  yet") until Cray raises the tier; never an individual account on a director's personal BVN. The
  BVN needed between the webhook and the Cray call is held in `identity_secrets` (encrypted, ≤ 24 h)
  and deleted once Cray answers. Phone: the business enters a contact phone on this step (Cray
  requires it for business accounts; not stored beyond the request
  — my call). **Verify in sandbox** which account type our tier allows.
- Changes to the Cray build: `createPermanentAccount` gains a required `bvn`; a new
  `createBusinessAccount(...)`; the pay page's transfer path gains the two steps above and stops
  showing "not available yet" once a business can complete them. The rest of the Cray design is
  unchanged.
- The business is told plainly that the BVN is shared with our payment provider only to open their
  transfer account (privacy copy, owner's legal review).

### 5.9 Admin

New page **`/admin/identity`** (one page per job, as the other admin pages): tabs or sections for
(a) checks `needs_review` (duplicate identity and duplicate RC/BN numbers only — Dojah's own
manual reviews are decided in Dojah's dashboard and reach us as its next webhook, so our admin and
Dojah never decide the same check; my call after the builder check), (b) screenings
`possible_match` / `error`, (c) people at the attempt cap. Each row shows the masked facts (role,
display name, legal name on record, last 3 digits, reason, Dojah reference to look up the evidence
in Dojah's dashboard) — never images. Actions with a required written reason: approve / reject a
check, clear / confirm a screening, screen again, allow another attempt. All actions go through
`security definer` functions that record who, when and why (policy §3.1, §6). Skeleton loading;
linked from the admin home queue with counts.

Payout approval (`/admin/money/payouts`): shows the creator's verified legal name next to the bank
account name; if they don't match (§5.4 person rule) a warning, not a block (policy §4.2 "name
consistency"); blocked only by the screening rule in §5.6.

## 6. Privacy and security

### 6.1 What we keep, and why (data minimisation, policy §7.1)
| Kept | Why | Not kept |
|---|---|---|
| Legal name on record, last 3 digits, date of birth (people) | Name gates and screening accuracy; record of what was checked (policy §6) | Full NIN/BVN, selfie, ID photo, phone, address, next of kin, Dojah's full record |
| Fingerprint of NIN/BVN | Detect reuse (policy §5.1); match a re-typed BVN without a paid call | — |
| Company name, type, RC/BN, directors' names (only if fetched) | KYB result; director match | CAC address, shareholders, emails, phones |
| Status, reasons, timestamps, Dojah reference, reviewer and reason | Audit trail (policy §3.1, §6) | — |

### 6.2 Fingerprints
`fingerprint = hex(HMAC-SHA256(IDENTITY_FINGERPRINT_KEY, "<kind-class>:" + digits))` with
kind-class `NIN` or `BVN` so a NIN and a BVN never collide; computed only on the server
(`src/lib/identity-crypto.ts`, with tests), stored with a version prefix (`v1:`) for rotation. Losing
the key means reuse checks restart and a re-typed BVN needs a fresh Dojah check (owner TODO: back it
up like the bank-number key).

### 6.3 Where numbers travel
The person types the NIN/BVN inside Dojah's widget (browser → Dojah). It reaches our server only in
Dojah's signed webhook (or the backstop lookup), where it is fingerprinted and dropped in the same
request. The re-typed BVN (§5.8) goes browser → our server action → fingerprint check → Cray → dropped.
None of these values appear in logs, errors, notifications, analytics, stored payloads or the
browser's storage; error messages mask digit runs (as `cray.ts` does).

### 6.4 The only time a full BVN is stored
A registered business's director BVN arrives in Dojah's webhook, but the Cray account can only be
opened after the advanced CAC director match, which may need a Dojah call that can fail and be
retried. So the BVN is held encrypted in `identity_secrets` for at most 24 hours, deleted on success,
failure or expiry (daily job). Same for an unregistered owner who started verification from the
transfer step. Nothing else stores a BVN.

### 6.5 Processor and retention
Dojah is a processor (policy §7.5): add it to `docs/PROVIDERS.md` with what it receives (name,
NIN/BVN, selfie, CAC numbers) and an owner TODO for its data-processing terms and transfer
assessment. Retention of `identity_checks` and `screenings`: kept until the owner's retention
schedule exists (policy §6, §7.6: TODO), never deleted to hide activity.

## 7. Testing

- **Unit (node):** `dojah.ts` (headers without `Bearer`, paths, CAC/AML/verification-lookup parsing,
  error masking); webhook signature (good, tampered, missing, wrong secret); `decideIdentityResult`
  for each Dojah outcome and step combination (use the docs' sample payload as a fixture);
  `namesMatch` / `companyNamesMatch` tables; fingerprints (stable, keyed, NIN≠BVN class, no key →
  error); attempt-cap maths; notification words.
- **pgTAP:** `identity_verified` per role/kind; gates in `apply_to_campaign` / `transition_campaign`
  (refused unverified, allowed verified, admins and live campaigns untouched); attempt caps and admin
  reset; duplicate fingerprint → `needs_review`; RLS (own rows without fingerprint/DOB; admins all;
  `identity_secrets` unreadable by every client role); screening blocks `approve_payout` while
  `possible_match`/`error` and not after `cleared`; admin functions require a reason and record who.
- **Race (money-race.mjs):** the same webhook twice at once → one decision; webhook vs backstop
  lookup for the same check; two starts at once → one active check.
- **Sandbox (owner provides keys):** NIN `70123456789` and BVN `22222222222` test values, CAC
  `1261103`; a real widget session end to end; the `verify in sandbox` items above.

## 8. Left to the builder
- Exact SQL shapes (views vs functions for the safe columns, the event-idempotency table), function
  names beyond those fixed here, onboarding step wiring in `src/lib/onboarding.ts` and
  `src/app/(onboarding)/onboarding/steps.ts` (copy in the existing "why we ask" style).
- How the widget component handles script load failure (show "Couldn't load the check. Try again"
  and log once).
- Docs in the same change: CLAUDE.md (§3 table: Dojah; §4 layout; §5 gates; §7; §8 kinds; §12
  decisions), `docs/PROVIDERS.md` (Dojah section), `docs/TODO.md` (owner tasks §10, sandbox items),
  `.env.example`, and the policy's gap register is the owner's to update.

## 9. Questions for the owner (to settle before planning)
1. ~~Existing creators with earnings~~ Decided 2026-11-22: payouts need a verified identity (§5.6).
2. ~~Dojah prices~~ Public page (https://dojah.io/pricing, read 2026-11-22): "as low as $0.06 per API
   call" (Starting Out), $0.04 (Optimizing); per-product prices via sales. Used for the advanced-CAC
   call (§5.3). The attempt caps stand.
3. ~~Unverified businesses approving hires~~ Decided 2026-11-22: approving a hire needs a verified
   identity (§5.7); hires approved before launch can still be paid.
4. ~~CAC-only~~ Decided 2026-11-22: CAC-only stays, plus a duplicate RC/BN number → admin review
   (§5.3) and the existing first-campaign admin review.
5. ~~Fallback personal Cray account~~ Decided 2026-11-22: dropped; registered businesses pay by card
   until Cray raises our tier (§5.8).

## 10. Owner tasks (docs/TODO.md)
- Dojah: complete compliance in the dashboard; get sandbox + live keys; build two EasyOnboard flows
  (NIN + liveness selfie; BVN + liveness selfie), theme them in Pitchype's colours, publish, note the
  widget ids; subscribe `https://<domain>/api/webhooks/dojah` to `kyc_widget`; copy the webhook
  secret; fund the wallet (calls return 402 when empty).
- Generate `IDENTITY_FINGERPRINT_KEY` per environment and back it up.
- Ask Cray to raise our tier above "Starter Business" for business transfer accounts.
- Legal review of the privacy copy on the verify steps and of Dojah's data-processing terms.
- Decide the retention schedule (policy §6, §7.6).

## 11. Facts relied on
- Dojah: widget options (`app_id`, `p_key`, `type`, `config.widget_id`, `reference_id` ≥ 10 chars,
  `user_data`, `gov_data`, `metadata`, callbacks); webhook service `kyc_widget` with `reference_id`,
  `verification_status` (`Ongoing`/`Pending`/`Completed`/`Failed`/`Abandoned`; "Completed means
  finished, not passed"), top-level `status`, `id_type`, `value`, per-step `data`; signature header
  `x-dojah-signature` = HMAC-SHA256 hex of the raw body with the subscription's webhook secret; file
  links expire in about an hour; `GET /api/v1/kyc/verification?reference_id=`; CAC
  `GET /api/v1/kyc/cac/basic|advance?rc_number=&company_type=`; AML `POST /api/v2/aml/screening`;
  auth headers `Authorization: <secret>` (no Bearer) and `AppId`; 402 = wallet empty, 424 = upstream
  down; sandbox `https://sandbox.dojah.io`.
- Cray (2026-11-22): permanent virtual accounts require a BVN; NIN is not a substitute; one-time
  accounts and card payments need none.
