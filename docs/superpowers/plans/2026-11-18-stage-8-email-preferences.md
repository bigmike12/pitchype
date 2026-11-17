# Stage 8: Email and Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every notification can become one email through Resend, sent right after the action that caused it, with per-person switches for three groups and money emails that always send.

**Architecture:** Email is a queue on the existing `notifications` table (due time, sent time, attempts). One function, `sendDueEmails()`, claims due rows under a lock, renders each from `describeNotification`, sends through a small Resend wrapper and marks the result. It is called after actions and webhooks (inside Next's `after()`), at the end of the daily jobs, and every minute by a Supabase `pg_cron` backstop.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (pgTAP for SQL, `node --test` for TS), Resend over `fetch`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-18-stage-8-email-preferences-design.md`

## Global Constraints

- No new npm dependency; Resend is called with `fetch` from `src/lib/resend.ts` only (CLAUDE.md §2, §2a).
- Schema changes only in new migration files; never edit an applied migration. Next timestamp is `20261118100000` or later.
- `notify()` stays the one writer of notification rows. Emails come only from `notifications`; no second system (CLAUDE.md §8).
- Money and deadline kinds always send, whatever the preferences.
- A send never runs inside a money transaction, and a failed send never fails the action that caused it.
- 50 rows per claim, at most 5 attempts per row, 5 minutes between attempts, chat email due 15 minutes after the message, at most one email per row per hour.
- Copy comes from `describeNotification`; never write separate email advice (an email must never tell a creator to start work before payment).
- Emails go to `public.users.email`. Never log bodies, addresses or the API key; log a step and an error class only.
- TypeScript strict, no `any` without a comment. Tested TS files import siblings with the `.ts` extension and must not import `server-only`, `next/*` or the Supabase clients at module top level (node tests can't load them; see `src/lib/review-deadlines.ts` for the `deps` pattern).
- Use design tokens only; account page UI follows `docs/DESIGN_SYSTEM.md`. Email look: Pitchype tokens (ink on porcelain, one violet button), text wordmark, no emoji, no side-stripe boxes, 600px table layout, Outlook-safe button, text passes contrast. Check the account page at 390px.
- Do not run `supabase db reset` (it deletes the user's local accounts). Apply migrations with `supabase migration up`; run SQL tests with `supabase test db`.
- Commits happen only when the user has asked for them. Each task ends with a commit step: run it only if they have; end messages with the attribution line the session gives.

## Review Focus

Failure modes the spec implies that no task's happy path would catch, most likely first:

1. **Thread read before the send** (chat): the row is claimed but `read_at` is now set, so no email goes out and nothing counts toward the hourly cap. Pinned in Task 6.
2. **HTML in names and previews** (`<`, `&`, quotes in a business name or message preview): escaped in the HTML part, untouched in the text part, and subject has no newlines. Pinned in Task 4.
3. **Resend down, rate-limited or slow** (429, 5xx, timeout): row stays due, retried after 5 minutes, stops after 5 attempts with one log line, and the action that caused it is unaffected. Pinned in Tasks 3, 6 and 7.
4. **A kind this app version doesn't know, or an admin recipient**: skipped without a crash and without being sent. Pinned in Tasks 2 and 6.
5. **Preferences switched off while an email is waiting, or no preferences row at all** (every new user): waiting email is dropped; no row means all three on. Pinned in Tasks 1, 2 and 6.

---

### Task 1: Database: queue columns, preferences, claim and finish

**Files:**
- Create: `supabase/migrations/20261118100000_email_queue.sql`
- Create: `supabase/tests/email_queue.test.sql`
- Modify: `scripts/money-race.mjs` (add scenario 22 and register it in `scenarios`)
- Modify: `src/types/database.ts` (regenerate with `npm run db:types`)

**Interfaces:**
- Consumes: `public.notify(person uuid, what notification_kind, facts jsonb, key text)` from `20261111120000_create_notifications.sql`; `public.current_user_id()`; helpers in `scripts/money-race-lib.mjs` (`race`, `as`, `must`).
- Produces (SQL):
  - Columns on `public.notifications`: `email_due_at timestamptz`, `emailed_at timestamptz`, `email_attempts integer not null default 0`.
  - Table `public.notification_preferences (user_id uuid primary key references public.users(id) on delete cascade, email_applications boolean not null default true, email_campaigns boolean not null default true, email_messages boolean not null default true)`. RLS on; a person selects only their own row; no direct writes.
  - `public.save_email_preferences(applications boolean, campaigns boolean, messages boolean) returns void` (authenticated; upserts the caller's row).
  - `public.claim_due_emails(max integer) returns table (id uuid, kind text, data jsonb, occurred_at timestamptz, read_at timestamptz, attempts integer, email text, role text, email_applications boolean, email_campaigns boolean, email_messages boolean)` (service_role only). Preference columns are `true` when the person has no row.
  - `public.finish_email(notification uuid, was_sent boolean) returns void` (service_role only).
  - Partial index on `notifications (email_due_at)` where `emailed_at is null and email_due_at is not null`.

Behaviour to implement (the test names below pin it):

- `notify()` sets `email_due_at = now()` for a new row, `now() + interval '15 minutes'` when the kind is `new_message`. Rows that exist when the migration runs keep `email_due_at` null.
- `notify()`'s `on conflict` path (grouped rows): if the row has not been emailed (`emailed_at is null`), keep an existing `email_due_at` (so a busy chat can't push its own email back forever) or compute one if it is null; if it was emailed 1 hour or more ago, set `emailed_at = null`, `email_attempts = 0` and a fresh due time; if it was emailed less than an hour ago, leave the email columns alone.
- `claim_due_emails(max)`: selects rows with `emailed_at is null`, `email_due_at <= now()`, `email_attempts < 5`, ordered by `email_due_at`, `for update skip locked` (joined to `users` for email and role, left-joined to preferences), then in the same statement adds 1 to `email_attempts` and sets `email_due_at = now() + interval '5 minutes'`, and returns them.
- `finish_email(id, true)` sets `emailed_at = now()`; `finish_email(id, false)` sets `email_due_at = null` (nothing pending, and it doesn't count toward the hourly cap).
- Grants: `claim_due_emails` and `finish_email` revoked from `public, anon, authenticated` and granted to `service_role`; `save_email_preferences` granted to `authenticated` only. Follow the grant style of `20261114100300_creator_wallet_summary.sql`.

- [ ] **Step 1: Write the failing pgTAP file `supabase/tests/email_queue.test.sql`** (style of `notifications.test.sql`: fixtures inside one `begin; … rollback;`), with these test names and assertions:
  - `new_message gets a due time 15 minutes out`: after `notify(person, 'new_message', …, 'k1')`, `email_due_at` is within a second of `now() + 15 min`.
  - `other kinds are due now`: `notify(person, 'hire_funded', …)` gives `email_due_at <= now()`.
  - `existing rows are never queued`: a row inserted before the migration's `alter` has `email_due_at is null` (insert with a null due time and assert claim does not return it).
  - `a bumped unsent chat row keeps its due time`: second `notify` with the same key leaves `email_due_at` unchanged.
  - `a chat row emailed under an hour ago is not requeued`: after `finish_email(id, true)` then a bump, `emailed_at` is still set.
  - `a chat row emailed over an hour ago is requeued`: set `emailed_at = now() - interval '2 hours'`, bump, then `emailed_at is null`, `email_attempts = 0`, due about 15 minutes out.
  - `claim returns only due, unsent, under-5-attempt rows`: three rows (due, not yet due, five attempts) give one result.
  - `claim pushes the due time out 5 minutes and counts the attempt`: a second `claim_due_emails(50)` straight after returns nothing; `email_attempts` is 1.
  - `claim returns the recipient's email, role and defaulted preferences`: no preferences row gives all three `true`.
  - `claim reflects saved preferences`: after `save_email_preferences(false, true, false)` as that person, claim returns `false, true, false`.
  - `finish_email(false) clears the due time and finish_email(true) sets emailed_at`.
  - `grants`: as `authenticated`, calling `claim_due_emails` or `finish_email` is refused; as `service_role` it works; `anon` can't call `save_email_preferences`; a person can select only their own preferences row.

- [ ] **Step 2: Run to verify failure**

Run: `supabase test db`
Expected: `email_queue.test.sql` fails (functions and columns don't exist).

- [ ] **Step 3: Write the migration `20261118100000_email_queue.sql`** with everything under "Behaviour to implement" (`create or replace function public.notify(...)` keeping its signature, `security definer`, `set search_path = ''`). Header comment states the invariants: the queue only ever holds rows made by `notify()`, the claim is the only way rows leave it, and old rows are never queued.

- [ ] **Step 4: Apply and run**

Run: `supabase migration up && supabase test db`
Expected: all files PASS, including `email_queue.test.sql` and the existing `notifications.test.sql` and money notification tests.

- [ ] **Step 5: Regenerate types:** `npm run db:types`, then `npm run typecheck` (passes).

- [ ] **Step 6: Add race scenario 22 to `scripts/money-race.mjs`:** "two claims at once": insert 20 due rows for one fixture person, then `race([...])` two `claim_due_emails(50)` calls through the service role; assert the two returned id sets don't overlap, together hold exactly the 20 ids, and each row's `email_attempts` is 1. Register it in the `scenarios` array after scenario 21.

- [ ] **Step 7: Run the race script**

Run: `node scripts/money-race.mjs`
Expected: all scenarios PASS, including the new one.

- [ ] **Step 8: Commit** `Queue notification emails and add email preferences`.

---

### Task 2: Which kinds email, and who wants them

**Files:**
- Create: `src/lib/notification-email.ts`
- Test: `src/lib/notification-email.test.ts`

**Interfaces:**
- Produces:
  - `export type EmailGroup = "applications" | "campaigns" | "messages"`
  - `export type EmailPolicy = "always" | EmailGroup`
  - `export type EmailPreferences = { applications: boolean; campaigns: boolean; messages: boolean }`
  - `export const ALL_EMAILS_ON: EmailPreferences`
  - `export const EMAIL_POLICY: Record<string, EmailPolicy>` (every kind in the design's table)
  - `export function wantsEmail(kind: string, preferences: EmailPreferences): boolean` (`always` → true; a group → that switch; a kind not in the table → false)
  - `export function parseEmailPreferences(form: FormData): EmailPreferences` (checkboxes named `applications`, `campaigns`, `messages`; absent means off)

- [ ] **Step 1: Write the failing tests in `notification-email.test.ts`:**
  - `every kind describeNotification handles has a policy`: build the list of kinds by calling `describeNotification` with `{ kind, data: {}, … }` for every kind named in the design table plus each kind in the `case` labels of `src/lib/notifications.ts` (read the file text with `node:fs` and pull the `case "…":` labels), and assert each is a key of `EMAIL_POLICY`; also assert every key of `EMAIL_POLICY` is handled (non-null result).
  - `money and deadline kinds always send`: for `hire_funded`, `engagement_settled`, `payout_paid`, `payout_failed`, `payout_rejected`, `payment_stranded`, `review_reminder`, `work_submitted`, `submission_denied`, `dispute_opened`, `hire_lapsed`, `application_hired`, `campaign_taken_down`, `verification_approved`, `profile_hidden`, `appeal_answered`: `wantsEmail(kind, { applications: false, campaigns: false, messages: false })` is `true`.
  - `switches control their group`: `application_received` follows `applications`, `campaign_approved` and `campaign_sent_back` follow `campaigns`, `new_message` follows `messages`, `work_started` and `hire_cancelled` follow `applications`.
  - `an unknown kind is not emailed`: `wantsEmail("kind_from_the_future", ALL_EMAILS_ON)` is `false`.
  - `parseEmailPreferences reads checkboxes`: a form with only `messages=on` gives `{ applications: false, campaigns: false, messages: true }`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/lib/notification-email.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the signatures above** in `src/lib/notification-email.ts` as a plain lookup object (no switch framework). Group membership follows the design table exactly.

- [ ] **Step 4: Run to verify pass**

Run: `node --test src/lib/notification-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `Say which notification kinds are emailed`.

---

### Task 3: The Resend boundary

**Files:**
- Create: `src/lib/resend.ts`
- Test: `src/lib/resend.test.ts`
- Modify: `.env.example` (add `RESEND_API_KEY` and `FROM_EMAIL` with comments in the file's existing style: server-only, never `NEXT_PUBLIC_`)
- Modify: `docs/PROVIDERS.md` (replace the "Not used yet" Resend paragraph with a section: what we call, where, what to change to replace it)

**Interfaces:**
- Produces:
  - `export class ResendError extends Error { status: number }` (`status` is the HTTP status, 0 when no answer came back)
  - `export type EmailMessage = { to: string; subject: string; html: string; text: string; idempotencyKey: string }`
  - `export async function sendEmail(message: EmailMessage): Promise<void>` (throws `ResendError`; resolves on any 2xx)

- [ ] **Step 1: Write the failing tests** (replace `globalThis.fetch` with a fake, restore in `afterEach`):
  - `posts to Resend with the key, sender and idempotency key`: fake fetch records the request; assert URL `https://api.resend.com/emails`, method `POST`, header `Authorization: Bearer test_key`, header `Idempotency-Key` equal to the message's key, and a JSON body with `from` equal to `FROM_EMAIL`, `to: [address]`, `subject`, `html`, `text`.
  - `a non-2xx answer throws ResendError with the status` (429 and 500).
  - `a network failure throws ResendError with status 0`.
  - `the error message never contains the key or the address`: with a failing fake whose body echoes both, assert neither string appears in `error.message`.
  - `a missing key or sender throws before calling fetch`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/lib/resend.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the signatures above** in the style of `src/lib/paystack.ts` (plain `fetch`, 15 s timeout through `AbortSignal.timeout`, `safeMessage` that strips the key and addresses, header comment saying this is the only file that calls Resend). No retries here; the queue retries.

- [ ] **Step 4: Run to verify pass**

Run: `node --test src/lib/resend.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the `docs/PROVIDERS.md` section and the `.env.example` entries.**

- [ ] **Step 6: Commit** `Add the Resend boundary`.

---

### Task 4: Render an email

**Files:**
- Create: `src/lib/email-template.ts`
- Test: `src/lib/email-template.test.ts`

**Interfaces:**
- Consumes: `NotificationView` from `src/lib/notifications.ts` (`{ title, body, href }`).
- Produces:
  - `export function renderEmail(view: NotificationView, siteUrl: string): { subject: string; html: string; text: string }`

- [ ] **Step 1: Write the failing tests:**
  - `subject is the title on one line`: a title with `\n` becomes one line.
  - `the button links to the absolute address`: `href: "/jobs/abc"` and `siteUrl: "https://pitchype.com"` produce `https://pitchype.com/jobs/abc` in the html and in the text.
  - `the footer links to the account settings`: html and text contain `https://pitchype.com/account`.
  - `html escapes names and previews`: a title `Tom & "Jerry" <b>x</b>` and body `<script>alert(1)</script>` never appear raw in `html`; the text part keeps them as written.
  - `a missing body leaves out the body paragraph` (no empty paragraph in the html).
  - `no emoji and no side-stripe borders`: `html` has no `border-left` and no characters in the emoji ranges.
  - `the html has a plain-text twin that carries the same title, body and link`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/lib/email-template.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `renderEmail`:** one layout for every kind: 600px table, porcelain background with a white card, text wordmark "Pitchype" in ink, the title as an `h1`-style line, the body paragraph, one violet "Open in Pitchype" button (VML fallback inside `<!--[if mso]>` like the shared samples; stacks to full width at 600px), footer "You can change which emails you get in your account settings." Take colour values from the tokens in `src/app/globals.css` as literals with a comment naming the token (email clients can't read CSS variables). A small local `escapeHtml`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test src/lib/email-template.test.ts`
Expected: PASS.

- [ ] **Step 5: Look at one rendered email:** write the html of a `work_submitted` and a `review_reminder` to the scratchpad and open it in a browser at 390px and 600px (Chrome tools or `open`). Check contrast and that the button stacks; fix the template if not.

- [ ] **Step 6: Commit** `Render notification emails`.

---

### Task 5: Data access for the queue and preferences

**Files:**
- Create: `src/lib/db/notification-emails.ts`

**Interfaces:**
- Consumes: SQL functions from Task 1; `createAdminClient()` from `src/lib/supabase/admin.ts`; `createSessionClient()` from `src/lib/supabase/server.ts`; `NotificationRow` from `src/lib/notifications.ts`; `EmailPreferences`, `ALL_EMAILS_ON` from Task 2.
- Produces:
  - `export type DueEmail = { notification: NotificationRow; attempts: number; to: string; role: "business" | "influencer" | "admin"; preferences: EmailPreferences }`
  - `export async function claimDueEmails(max: number): Promise<DueEmail[]>` (admin client, `claim_due_emails`)
  - `export async function finishEmail(notificationId: string, wasSent: boolean): Promise<void>` (admin client, `finish_email`)
  - `export async function getMyEmailPreferences(): Promise<EmailPreferences>` (session client; no row gives `ALL_EMAILS_ON`)
  - `export async function saveMyEmailPreferences(preferences: EmailPreferences): Promise<void>` (session client, `save_email_preferences`)

- [ ] **Step 1: Implement the four functions,** following `src/lib/db/submissions.ts` (header comment, `throw new Error("… failed (code)")` with the error code only, never the message). No test file: these are thin wrappers over SQL tested in Task 1 (same convention as the other `lib/db` files).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit** `Add data access for emails and preferences`.

---

### Task 6: The send run and its route

**Files:**
- Create: `src/lib/send-emails.ts`
- Create: `src/app/api/cron/send-emails/route.ts`
- Test: `src/lib/send-emails.test.ts`

**Interfaces:**
- Consumes: `DueEmail` and the db functions (Task 5); `wantsEmail` (Task 2); `renderEmail` (Task 4); `sendEmail`, `ResendError` (Task 3); `describeNotification` from `src/lib/notifications.ts`; `SITE_URL` from `src/lib/site.ts`; `authorised` from `src/app/api/cron/authorised.ts`.
- Produces:
  - `export type SendEmailsDeps = { claimDueEmails(max: number): Promise<DueEmail[]>; finishEmail(id: string, wasSent: boolean): Promise<void>; sendEmail(message: EmailMessage): Promise<void>; siteUrl: string }`
  - `export type SendEmailsResult = { sent: number; skipped: number; failed: number }`
  - `export async function sendDueEmails(deps?: SendEmailsDeps): Promise<SendEmailsResult>` (real deps imported lazily, as `src/lib/review-deadlines.ts` does)
  - `export function sendEmailsStatus(result: SendEmailsResult): 200 | 500` (500 when `failed > 0`)
  - `export async function sendDueEmailsSafely(): Promise<void>` (never throws; logs `send-emails: <error class>` only)

Rules inside `sendDueEmails` (each is a test below): claim 50; for each row, in order: unknown kind or `role === "admin"` → `finishEmail(id, false)`, skipped; `!wantsEmail(kind, preferences)` → skipped; kind `new_message` with `notification.readAt` set → skipped; `describeNotification(notification, role)` null → skipped; otherwise render and `sendEmail` with `idempotencyKey = `${id}:${occurredAt}``, then `finishEmail(id, true)`. If `sendEmail` throws, do not call `finishEmail`, count `failed`, and when the row's `attempts` is 5 log one line `send-emails: gave up after 5 attempts` (no address, no body). One row failing never stops the others.

- [ ] **Step 1: Write the failing tests** with fake deps recording calls:
  - `sends a due money email and marks it sent`: one `hire_funded` row; `sendEmail` called once with `to` the row's address and subject equal to the described title; `finishEmail(id, true)`.
  - `an always-send kind ignores switched-off preferences`.
  - `a switched-off group is skipped and cleared`: `application_received` with `applications: false`; no send; `finishEmail(id, false)`.
  - `a chat row read before the send is skipped`: `new_message` with `readAt` set; no send; `finishEmail(id, false)`.
  - `a read money email still sends`: `hire_funded` with `readAt` set sends.
  - `an unknown kind and an admin recipient are skipped without a crash`.
  - `a Resend failure leaves the row for retry`: `sendEmail` throws `ResendError(…, 503)`; no `finishEmail`; result `failed: 1`; the next row in the batch is still sent.
  - `the fifth failed attempt logs once and nothing else`: `attempts: 5`, assert one logged line that contains neither the address nor the title.
  - `the idempotency key is the id and occurred_at`.
  - `sendEmailsStatus is 500 only when something failed`.
  - `sendDueEmailsSafely swallows a claim failure` (a `claimDueEmails` that throws makes the function resolve and log one line).

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/lib/send-emails.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `sendDueEmails`, `sendEmailsStatus` and `sendDueEmailsSafely`** with the signatures and rules above. Header comment states the invariants: one row is sent at most once (the claim hides it for 5 minutes; Resend's idempotency key covers a crash before `finishEmail`), and a failure never throws into a caller.

- [ ] **Step 4: Run to verify pass**

Run: `node --test src/lib/send-emails.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route `src/app/api/cron/send-emails/route.ts`** in the shape of the other cron routes: `authorised(request)` or 401, then `sendDueEmails()`, respond with the result and `sendEmailsStatus(result)`. `GET` handler, comment saying who calls it (pg_cron every minute, Vercel Cron daily).

- [ ] **Step 6: Check the route by hand against local Supabase.** Insert a due notification for a local test person, run `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3030/api/cron/send-emails` with `RESEND_API_KEY` set to a Resend test key (or, with no key, expect `failed: 1` and the row still due). Say plainly in the report which of the two you could run.

- [ ] **Step 7: Commit** `Send due notification emails`.

---

### Task 7: Send right after the action

**Files:**
- Create: `src/lib/email-after.ts`
- Modify: the action files and routes listed in Step 2
- Modify: `src/app/api/cron/expire-engagements/route.ts`, `src/app/api/cron/review-deadlines/route.ts`, `src/app/api/cron/money-checks/route.ts`

**Interfaces:**
- Consumes: `sendDueEmailsSafely` (Task 6).
- Produces: `export function sendEmailsAfterResponse(): void` — `after(sendDueEmailsSafely)` from `next/server`. Not unit-tested (it needs Next's request scope); its behaviour is pinned by Task 6's `sendDueEmailsSafely` tests.

- [ ] **Step 1: Create `src/lib/email-after.ts`** with the signature above and a comment: runs once the response is sent, so an email problem can't slow or fail the action; call it before any `redirect()`.

- [ ] **Step 2: Add `sendEmailsAfterResponse()` after the successful database change in these files** (each action that changes a hire, application, campaign, payout, dispute or verification; skip actions that only read or validate, and skip `inbox/actions.ts` because chat emails wait 15 minutes and the backstop sends them):
  - `src/app/(portal)/(business)/business/campaigns/[id]/applications/actions.ts`
  - `src/app/(portal)/(business)/business/campaigns/actions.ts`
  - `src/app/(portal)/(business)/business/engagements/[id]/actions.ts`
  - `src/app/(portal)/(business)/business/engagements/[id]/dispute/actions.ts`
  - `src/app/(portal)/(business)/business/engagements/[id]/pay/actions.ts`
  - `src/app/(portal)/(influencer)/campaigns/[id]/actions.ts`
  - `src/app/(portal)/(influencer)/jobs/[id]/actions.ts`
  - `src/app/(portal)/(influencer)/jobs/[id]/dispute/actions.ts`
  - `src/app/(portal)/(influencer)/profile/actions.ts`
  - `src/app/(portal)/(influencer)/wallet/actions.ts`
  - `src/app/(portal)/(admin)/admin/actions.ts`
  - `src/app/(portal)/(admin)/admin/disputes/actions.ts`
  - `src/app/(portal)/(admin)/admin/money/actions.ts`
  - `src/app/(portal)/account/standing/actions.ts`
  - `src/app/(portal)/account/block-actions.ts`: not needed (blocking notifies no one); leave unchanged.

- [ ] **Step 3: Add it after every caller of `confirmCardPayment()` and `confirmTransfer()`** (find them with `grep -rn "confirmCardPayment\|confirmTransfer" src`): the Paystack webhook route `src/app/api/webhooks/paystack/route.ts`, the payment return page, and the admin "Check with Paystack" action. In the webhook route call it after the answer is built and before returning, and never change the response status because of it.

- [ ] **Step 4: Add `await sendDueEmailsSafely()` at the end of the three daily job routes,** just before they build their response (these run in a normal request, not `after`; the job result and status are unchanged).

- [ ] **Step 5: Add `{ "path": "/api/cron/send-emails", "schedule": "45 3 * * *" }` to `vercel.json`** (the daily second net).

- [ ] **Step 6: Lint, typecheck and the full unit suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 7: Exercise one real flow locally.** With the dev server on 3030, `RESEND_API_KEY` and `FROM_EMAIL` set, and local Supabase running: as a local business, approve an application; confirm the creator's `notifications` row has `emailed_at` set within seconds (or, with no Resend key, that `email_attempts` is 1 and the action still succeeded). Say plainly what you could and couldn't run.

- [ ] **Step 8: Commit** `Send emails right after the action that caused them`.

---

### Task 8: The Emails section on the account page

**Files:**
- Modify: `src/app/(portal)/account/page.tsx` (new `Section id="emails"`, shown to business and creator accounts, not admins)
- Modify: `src/app/(portal)/account/actions.ts` (new `updateEmailPreferencesAction`)
- Create: `src/app/(portal)/account/email-preferences-form.tsx` (client component only if it needs `useActionState` for the saved message; otherwise a plain form)

**Interfaces:**
- Consumes: `getMyEmailPreferences`, `saveMyEmailPreferences` (Task 5); `parseEmailPreferences` (Task 2); `requireUser` from `src/lib/auth.ts`.
- Produces: `export async function updateEmailPreferencesAction(previous: FormState<never>, form: FormData): Promise<FormState<never>>` (authenticate with `requireUser`, refuse admins, parse with `parseEmailPreferences`, save, return a success state; on a database error return the same style of retry message the profile action uses).

Section copy: title "Emails"; line "We email you when something needs you or money moves. Those emails always send." Three labelled checkboxes: "Applications and hiring", "Campaign updates", "Messages (only if you haven't read them after 15 minutes)". Button "Save email settings". Use existing form and field components; no new colours.

- [ ] **Step 1: Write the action and the form** as above; the page reads the current values with `getMyEmailPreferences()` inside the existing `Account` component's `Promise.all`.

- [ ] **Step 2: Lint and typecheck** (the parsing is already tested in Task 2's `parseEmailPreferences`; no new test file here)

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Exercise it in the browser** at 390px and desktop as a local creator and a local business: the three switches show on, turning one off and saving persists after a reload, an admin sees no Emails section, and the page keeps its skeleton. Say plainly what you could and couldn't run.

- [ ] **Step 4: Commit** `Let people choose which emails they get`.

---

### Task 9: The per-minute backstop and the docs

**Files:**
- Create: `supabase/migrations/20261118100100_email_schedule.sql`
- Modify: `docs/PROVIDERS.md` (add `pg_cron` and `pg_net` rows with how to replace them: any scheduler that calls the route with the bearer secret)
- Modify: `docs/TODO.md` (tick the Stage 8 email item in §11 for email and preferences; add the setup steps below; add "paid features" and "admin notifications" as still open)
- Modify: `CLAUDE.md` §8 (one short paragraph: email is built, how it is sent, where preferences live)

**Interfaces:**
- Consumes: the route `/api/cron/send-emails` (Task 6).
- Produces: a `pg_cron` job named `send-notification-emails`, every minute, that calls `net.http_get` on the app URL and route with `Authorization: Bearer <secret>`, reading both from Supabase Vault (`app_url` and `cron_secret`). The migration must apply cleanly when the extensions or Vault entries are missing: guard with `if exists (select 1 from pg_extension …)` or `create extension if not exists`, and make the scheduled command do nothing (not error) when a Vault entry is missing, like the `supabase_realtime` guard in `20261111120000_create_notifications.sql`.

- [ ] **Step 1: Write the migration** as above, header comment explaining that the schedule is a backstop for chat delay and retries, and that emails still send without it.

- [ ] **Step 2: Apply locally**

Run: `supabase migration up && supabase test db`
Expected: applies cleanly with no Vault entries; all SQL tests PASS.

- [ ] **Step 3: Write the docs.** In `docs/TODO.md`, add under "You:" (one checkbox each): add `RESEND_API_KEY` and `FROM_EMAIL` to `.env.production.local` and Vercel; in Supabase add Vault secrets `app_url` (the live site URL) and `cron_secret` (same value as `CRON_SECRET`); push migrations `20261118100000` and `20261118100100` (ask first, per hosted-state rule); send one test email on the live site and check it in the inbox and spam folder.

- [ ] **Step 4: Full check**

Run: `npm run lint && npm run typecheck && npm test && supabase test db`
Expected: all PASS.

- [ ] **Step 5: Commit** `Schedule the email backstop and document Stage 8`.

---

## Self-Review

- **Spec coverage:** kinds table and policy (Task 2); queue columns, `notify()` due times, bump and hourly cap, preferences table, claim and finish, grants, index (Task 1); Resend boundary, env, PROVIDERS (Task 3); one layout, escaping, absolute links, settings footer, look (Task 4); send run, idempotency key, attempts cap, read-thread and preference skips, 500 on failure, bearer route (Task 6); after-action, webhook and daily-job sending (Task 7); preferences UI and action (Task 8); pg_cron backstop, Vercel daily net, Vault setup, docs and CLAUDE.md (Tasks 7 and 9); race test (Task 1). No gaps found.
- **Types match across tasks:** `EmailPreferences` (Task 2) is used by Tasks 5, 6 and 8; `DueEmail` (Task 5) by Task 6; `EmailMessage` (Task 3) by Task 6; `sendDueEmailsSafely` (Task 6) by Task 7; SQL function and column names (Task 1) match the db wrappers in Task 5.
- **Design conflict found and resolved:** the design originally said a switched-off or read-thread row should be "marked sent", which would count against the one-per-hour cap and could silence a real later message. `finish_email(id, false)` instead clears the due time. The design's step 3 now says the same.
- **Proportion:** nine tasks for a spec with about nine parts; code appears only as signatures, test names and fixed values.
