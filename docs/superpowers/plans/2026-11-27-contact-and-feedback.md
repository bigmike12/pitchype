# Contact page and feedback loop: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/contact` page whose form emails the team inbox, and a private feedback loop: businesses and creators send ideas and problems from `/feedback`, admins triage them on `/admin/feedback`, and senders (including those of merged duplicates) are notified and emailed once when a request ships.

**Architecture:** The contact form is a server action that validates, checks a honeypot and an IP rate limit, then calls `sendEmail()` with a reply-to; nothing is stored. Feedback lives in one table, `feedback_requests`, written only through `security definer` functions; the "shipped" notice is a normal `notify()` row, so the existing email queue delivers it. Pages follow the portal's patterns (`requireRole`, `FormState` + `useActionState`, skeleton fallbacks, `pageOf` paging).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (RLS, plpgsql), pgTAP, Node's test runner, Resend over fetch, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-11-27-contact-and-feedback-design.md`

## Global Constraints

- Branch `contact-and-feedback` (stacked on `redirect-old-site-pages`, PR #38). Commit per task; messages imperative, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- No new dependencies. No CAPTCHA. No direct Supabase SDK calls outside `src/lib/db/*` (CLAUDE.md §2a).
- Contact form: name 1–80, valid email, topic one of `question` | `account` | `partnership` ("A question", "Help with my account", "Partnerships or press"), message 10–2,000 characters; honeypot field `pt_extra`; 5 sends per IP per hour (limiter name `contact-form`); idempotency key `contact:<form id>`; email to `CONTACT_EMAIL` with reply-to the sender; subject `Contact: <topic label> from <name>`; success copy names the sender's address and promises no response time.
- Feedback: kind `idea` | `problem`; title 3–120; details 10–2,000; status `received` | `planned` | `shipped` | `not_planned`; admin note ≤ 1,000; 10 requests per person per day (limiter name `feedback`); shown as `#<number>`.
- Notification kind `feedback_shipped`, facts `{ number, title, note }` with the **sender's own** title; `EMAIL_POLICY` `always`; links to `/feedback`. Notified once per request, ever (`shipped_at` guard).
- Never log a message body, an email address or a request's text. Requests are visible only to their sender and admins.
- Every new page has a skeleton Suspense fallback (`PageLoading` + `skeleton.tsx`) and works at 390px. Tokens only; no new hex values.
- Database tests: **never `supabase db reset` the user's local DB.** Run pgTAP on a throwaway copy: copy `supabase/` to the scratchpad, set `project_id = "pitchype-check"`, shift ports 5432x → 5532x, `supabase start -x studio,edge-runtime,logflare,vector,supavisor,postgres-meta,imgproxy,realtime,mailpit` with Homebrew `supabase` (v2.65.5, not `npx`), `supabase test db`, then `supabase stop --no-backup`. Node is under `~/.nvm/versions/node/v22.9.0/bin`; `gh` is `/opt/homebrew/bin/gh`.
- The user's dev server runs on 3030; don't kill it. Use 3100 for a production check.

## Review Focus

1. **Shipping twice, or ship → planned → shipped:** each sender is notified exactly once. Pinned in Task 3 (pgTAP).
2. **A duplicate merged into an already shipped request:** its sender is notified immediately, with their own title. Pinned in Task 3.
3. **Another person's request never leaks**, not through RLS, not through `my_feedback_requests()` (a merged duplicate shows only the main's status and note, never its title, details or sender). Pinned in Task 3.
4. **The honeypot and the rate limit on the public form:** a filled honeypot answers success and sends nothing; the 6th send in an hour is refused with a readable message. Pinned in Task 1 (unit) and Task 2 (action check).
5. **Resend down on `/contact`:** the person sees an error with the `mailto:` link and their typed values are kept. Pinned in Task 2.

---

### Task 1: Contact form parsing and the email it sends

**Files:**
- Create: `src/lib/contact.ts`, `src/lib/contact.test.ts`
- Modify: `src/lib/resend.ts` (optional `replyTo`), `src/lib/site.ts` (drop the "placeholder" comment on `CONTACT_EMAIL`; the inbox is real)

**Interfaces:**
- Produces:
  - `CONTACT_TOPICS: readonly { value: "question" | "account" | "partnership"; label: string }[]`
  - `type ContactField = "name" | "email" | "topic" | "message"`
  - `type ContactMessage = { name: string; email: string; topic: ContactTopic; message: string; formId: string }`
  - `honeypotFilled(form: FormData): boolean` (field `pt_extra` non-blank)
  - `parseContactForm(form: FormData): Parsed<ContactMessage, ContactField>` (uses `text()`; trims; `formId` from field `form_id` if `isUuid`, otherwise `crypto.randomUUID()`)
  - `contactEmail(message: ContactMessage): { subject: string; text: string; html: string }` (HTML-escapes every user value)
  - `EmailMessage.replyTo?: string`, sent to Resend as `reply_to: [replyTo]` only when set

- [ ] **Step 1: Write the failing tests** in `src/lib/contact.test.ts` (node:test, like the other `*.test.ts`):
  - `parseContactForm` accepts `{ name: " Ada ", email: "ada@example.com", topic: "account", message: "Ten chars!!" }` → `ok: true`, `name === "Ada"`.
  - rejects each: empty name; 81-char name; `email: "ada@"`; `topic: "sales"`; 9-char message; 2,001-char message, with an error on that field and the typed `values` returned.
  - `form_id` of `"not-a-uuid"` still parses, with a UUID-shaped `formId`.
  - `honeypotFilled` is true for `pt_extra: "x"`, false for `""` or missing.
  - `contactEmail` subject is `"Contact: Help with my account from Ada"`; `html` contains `&lt;script&gt;` when the message is `<script>`; `text` contains the sender's email and the message.
- [ ] **Step 2: Run** `npm test -- --test-name-pattern=contact` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/contact.ts` (no framework imports, so it stays unit-testable) and add `replyTo` to `EmailMessage`/`sendEmail` in `src/lib/resend.ts`.
- [ ] **Step 4: Run** `npm test` → all pass; `npm run typecheck` clean.
- [ ] **Step 5: Commit** "Parse the contact form and write its email".

### Task 2: The `/contact` page

**Files:**
- Create: `src/app/(marketing)/contact/page.tsx`, `src/app/(marketing)/contact/actions.ts`, `src/app/(marketing)/contact/contact-form.tsx` (client component)
- Modify: `next.config.ts` (redirects), `src/app/sitemap.ts`, `src/lib/llms.ts` (+ its test if it lists pages), `src/components/landing/site-footer.tsx` (a "Contact" link in the Connect list, above the email)

**Interfaces:**
- Consumes: everything Task 1 produces; `createRateLimiter` (`src/lib/rate-limit.ts`); `clientIp()`; `sendEmail()`; `CONTACT_EMAIL`, `SOCIAL_PROFILES`.
- Produces: `sendContactMessage(previous: FormState<ContactField>, form: FormData): Promise<FormState<ContactField>>` ("use server").

- [ ] **Step 1: Write the action** in this order: honeypot filled → return `{ status: "success" }` with the generic thanks and send nothing → `parseContactForm` (errors → `status: "error"`, `errors`, `values`) → limiter `contact-form`, 5 per 3,600,000 ms, key `clientIp()`; limited → error "You've sent a few messages already. Try again in an hour, or email us." with `values` → `sendEmail({ to: CONTACT_EMAIL, replyTo: email, idempotencyKey: \`contact:${formId}\`, ...contactEmail(msg) })`; a thrown error → `console.error("contact: send failed", error.message)` (no body, no address) and return an error offering the `mailto:` link, with `values` kept → success message `Thanks. We'll reply to ${email}.`
- [ ] **Step 2: Build the page** (server component, `metadata` with title "Contact", description, canonical `/contact`): heading, one line on what to write about, `mailto:` link, social links, a link to `/#faq`, and `<ContactForm />` with a hidden `form_id` that the client form sets once in a `useEffect` (`crypto.randomUUID()` into state, so the page stays static and there's no hydration mismatch; before that runs the field is empty and the parser falls back to a fresh id) and the honeypot input (visually hidden off-screen, `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden`). Use the design system's `TextField`, select and `Button`; on success replace the form with the thanks line. Skeleton fallback for any Suspense boundary.
- [ ] **Step 3: Redirects** in `next.config.ts`: remove `/contact`; `/contact-us` and `/contactus` → `/contact` (permanent). Services entries unchanged.
- [ ] **Step 4: Wire it in:** sitemap entry (`monthly`, priority 0.5), an `llms.txt` line, footer link.
- [ ] **Step 5: Verify** on the dev server (3030): `curl -sI localhost:3030/contact-us` → 308 to `/contact`; `/contact` renders at 390px and desktop; submitting empty shows field errors; submitting with `pt_extra` filled (devtools) shows thanks and sends nothing; a valid send reaches the inbox if `RESEND_API_KEY` is set locally (otherwise say so) and shows the error-with-mailto path when it isn't set. `npm run lint && npm run typecheck && npm test` pass.
- [ ] **Step 6: Commit** "Add a contact page that emails the team inbox".

### Task 3: `feedback_requests` and its functions (database)

**Files:**
- Create: `supabase/migrations/20261202100000_feedback_notice_kind.sql`, `supabase/migrations/20261202100100_create_feedback_requests.sql`, `supabase/tests/feedback.test.sql`
- Modify: `src/types/database.ts` (regenerate with `npm run db:types` against the throwaway instance's URL, or hand-add the new table and functions if that's not possible; say which)

**Interfaces:**
- Consumes: `public.current_user_id()`, `public.current_user_role()`, `public.require_admin()` (raises `admins_only`, 42501), `public.display_name_of(uuid)`, `public.notify(person, what, facts, key)`.
- Produces (all `security definer`, `set search_path = ''`, `revoke all … from public, anon`):
  - `submit_feedback(kind text, title text, details text) returns table (id uuid, number bigint)` — granted to `authenticated`. Refuses `not_allowed` (no user, or role not business/influencer) and `feedback_invalid` (kind or lengths, after trim).
  - `my_feedback_requests() returns table (id uuid, number bigint, kind text, title text, details text, status text, admin_note text, created_at timestamptz, merged boolean)` — `authenticated`; the caller's rows, newest first; for a merged row, `status` and `admin_note` are the main request's.
  - `admin_feedback_requests() returns table (id uuid, number bigint, kind text, title text, details text, status text, admin_note text, created_at timestamptz, shipped_at timestamptz, duplicate_of_number bigint, duplicate_count integer, sender_role text, sender_email text, sender_name text)` — `authenticated`, calls `require_admin()`; newest first. Filtering happens in the app.
  - `set_feedback_status(request_id uuid, new_status text, note text) returns void` — admin. Refuses `no_such_feedback`, `is_duplicate`, `feedback_invalid`.
  - `mark_feedback_duplicate(request_id uuid, main_number bigint) returns void` — admin. Refuses `no_such_feedback`, `feedback_invalid` (self), `main_is_duplicate`, `has_duplicates`.
  - `unmark_feedback_duplicate(request_id uuid) returns void` — admin. Refuses `no_such_feedback`.
  - Refusals are `raise exception '<code>' using errcode = 'P0001'`.

- [ ] **Step 1: Kind migration** `20261202100000`: `alter type public.notification_kind add value 'feedback_shipped';` with the usual comment that a new enum value can't be used in the transaction that adds it.
- [ ] **Step 2: Write the failing pgTAP test** `supabase/tests/feedback.test.sql` (pattern: `moderation_rls.test.sql`; users Ada business, Chidi and Dayo creators, Efe admin; `set local role authenticated` + `request.jwt.claims`). Assertions:
  - Chidi submits → returns a number; `throws_ok` `feedback_invalid` for title `"ab"`, 2,001-char details, kind `"bug"`; Efe (admin) submitting → `not_allowed`.
  - RLS: Chidi selects 1 row from `feedback_requests`; Dayo selects 0; Efe selects all; `insert`/`update`/`delete` on the table as `authenticated` all fail.
  - Non-admin calling `set_feedback_status`, `mark_feedback_duplicate`, `admin_feedback_requests` → `42501`.
  - Dayo's request marked duplicate of Chidi's; `set_feedback_status` on Dayo's → `is_duplicate`; marking Chidi's as a duplicate of a third → `has_duplicates`; marking onto Dayo's → `main_is_duplicate`; onto itself → `feedback_invalid`.
  - Dayo's `my_feedback_requests()` returns his own title with `merged = true` and the main's status/note after Efe sets Chidi's to `planned` with a note.
  - Ship Chidi's: exactly one `feedback_shipped` notification each for Chidi and Dayo; Dayo's `data ->> 'title'` is Dayo's own title; Dayo's row is now `shipped`.
  - Ship again, then `planned`, then `shipped`: still one notification each.
  - Ada's request merged into the already shipped one → Ada notified at once, one row.
  - `email_due_at` is set on the notification (the queue will send it).
- [ ] **Step 3: Run** on the throwaway instance (Global Constraints) → FAIL (functions missing).
- [ ] **Step 4: Write the table migration** `20261202100100`: the table per the spec (number `bigint generated always as identity unique`, checks for kind, status, lengths, `duplicate_of <> id`), index on `(user_id, created_at desc)` and on `duplicate_of`, an `updated_at` trigger, RLS enabled with two select policies (`user_id = current_user_id()`; `current_user_role() = 'admin'`), `revoke insert, update, delete on … from anon, authenticated, service_role`, and the functions above. Shipping: lock the main row `for update`, set it, then `update … set status = 'shipped', shipped_at = now() where (id = main or duplicate_of = main) and shipped_at is null returning user_id, number, title` and `notify(user_id, 'feedback_shipped', jsonb_build_object('number', number, 'title', title, 'note', main note), 'feedback_shipped:' || id)` for each returned row. A main moved off `shipped` keeps `shipped_at`.
- [ ] **Step 5: Run** `supabase test db` on the throwaway instance → all suites pass (not just the new one). Then `supabase stop --no-backup`.
- [ ] **Step 6: Regenerate types**; `npm run typecheck` clean.
- [ ] **Step 7: Commit** "Store feedback requests and tell people when theirs ships".

### Task 4: Feedback words, parsing and the notification

**Files:**
- Create: `src/lib/feedback.ts`, `src/lib/feedback.test.ts`
- Modify: `src/lib/refusals.ts` (codes `feedback_invalid`, `no_such_feedback`, `is_duplicate`, `main_is_duplicate`, `has_duplicates`), `src/lib/notifications.ts` (`case "feedback_shipped"`), `src/lib/notification-email.ts` (`feedback_shipped: "always"`), `src/lib/notifications.test.ts`, `src/lib/notification-email.test.ts`

**Interfaces:**
- Produces:
  - `FEEDBACK_KINDS`, `FEEDBACK_STATUSES` (value + label: "Received", "Planned", "Shipped", "Not planned"; kinds "Suggest an idea", "Something's not working")
  - `type FeedbackField = "kind" | "title" | "details"`; `parseFeedbackForm(form: FormData): Parsed<{ kind: FeedbackKind; title: string; details: string }, FeedbackField>`
  - `type StatusField = "status" | "note"`; `parseStatusForm(form: FormData): Parsed<{ id: string; status: FeedbackStatus; note: string | null }, StatusField>` (blank note → null; ≤ 1,000)
  - `parseDuplicateForm(form: FormData): Parsed<{ id: string; mainNumber: number }, "main">` (accepts `42` or `#42`, positive integer)
- [ ] **Step 1: Write failing tests:** limits from Global Constraints on each parser (both edges); `"#42"` → 42, `"0"`/`"x"` rejected; `describeNotification({ kind: "feedback_shipped", data: { number: 42, title: "Dark mode", note: "In settings" } })` → title `"Something you asked for is live"`, body contains `#42` and `Dark mode` and the note, `href: "/feedback"`; with no note the body has no trailing separator; `EMAIL_POLICY.feedback_shipped === "always"`; every new refusal code has text (the refusals test, if one exists, or a direct `isRefusal` check).
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** the parsers and words; add the refusal texts (plain, second person, e.g. `is_duplicate`: "This request is merged into another. Change the main request instead.").
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → pass.
- [ ] **Step 5: Commit** "Add the words and form rules for feedback".

### Task 5: `/feedback` for businesses and creators

**Files:**
- Create: `src/lib/db/feedback.ts`, `src/app/(portal)/feedback/page.tsx`, `src/app/(portal)/feedback/actions.ts`, `src/app/(portal)/feedback/feedback-form.tsx`
- Modify: `src/proxy.ts` (`/feedback` in `SIGNED_IN_ONLY` and the matcher), `src/lib/portal.ts` (nav item for `business` and `influencer`: `{ href: "/feedback", label: "Feedback", icon: "feedback", group: "Help" }` as the last group), `src/components/shells/portal-nav.tsx` (`feedback: MessageSquarePlus` in `ICONS`), `src/lib/portal.test.ts` if it snapshots the nav

**Interfaces:**
- Consumes: Task 3's functions; Task 4's parsers, labels and refusals; `refused()`, `Result<T>`.
- Produces (in `src/lib/db/feedback.ts`, session client):
  - `type MyFeedbackRequest = { id; number; kind; title; details; status; adminNote: string | null; createdAt: string; merged: boolean }`
  - `submitFeedback(input: { kind; title; details }): Promise<Result<{ id: string; number: number }>>`
  - `listMyFeedback(): Promise<MyFeedbackRequest[]>`
  - `sendFeedback(previous: FormState<FeedbackField>, form: FormData): Promise<FormState<FeedbackField>>` in `actions.ts`: `requireRole` business or influencer → parse → limiter `feedback`, 10 per 86,400,000 ms, key user id → `submitFeedback` → `revalidatePath("/feedback")` → success "Thanks. We've got it as #<number>."

- [ ] **Step 1: Write the data functions and action** as above; admins hitting `/feedback` are redirected to `/admin/feedback`.
- [ ] **Step 2: Build the page:** `PageHeader` ("Feedback", lead: "Tell us what would make Pitchype better, or what isn't working. Only our team sees it."), the form (kind as two radio cards, title, details), then "Your requests" paged with `pageOf` (page size 10) and `pagedHref`: `#number`, title, kind label, sent date, status chip (design-system badge), admin note, and "Others asked for this too" when `merged`. Empty state: "We read every request. When something you asked for ships, we'll tell you." Skeleton fallback shaped like form + list.
- [ ] **Step 3: Verify** on 3030 as a local business and a local creator account (don't create accounts on the user's local DB without deleting them after; use `e2e-*@example.com` and clean up): send a request, see it as Received; 390px layout; sidebar link highlights. `npm run lint && npm run typecheck && npm test` pass. (Needs Task 3's migrations applied to the local DB: apply only the two new migrations with `supabase migration up`, never `db reset`.)
- [ ] **Step 4: Commit** "Let businesses and creators send feedback".

### Task 6: `/admin/feedback`

**Files:**
- Create: `src/app/(portal)/(admin)/admin/feedback/page.tsx`, `src/app/(portal)/(admin)/admin/feedback/feedback-card.tsx`
- Modify: `src/lib/db/feedback.ts` (admin functions), `src/app/(portal)/(admin)/admin/actions.ts` (three actions), `src/lib/portal.ts` (admin nav item `{ href: "/admin/feedback", label: "Feedback", icon: "feedback", group: "Review", attention: "feedback", badgeLabel: "new" }` after Reports; `AdminAttention.feedback: number`), `src/lib/db/admin-overview.ts` (count of `status = 'received'` and `duplicate_of is null`), `src/app/(portal)/(admin)/admin/page.tsx` (a "New feedback" stat linking to `/admin/feedback`)

**Interfaces:**
- Consumes: Task 3's admin functions; Task 4's `parseStatusForm`, `parseDuplicateForm`, labels.
- Produces:
  - `type AdminFeedbackRequest` mirroring `admin_feedback_requests()` in camelCase
  - `listFeedbackForAdmin(): Promise<AdminFeedbackRequest[]>`, `setFeedbackStatus(id, status, note): Promise<Result<null>>`, `markFeedbackDuplicate(id, mainNumber): Promise<Result<null>>`, `unmarkFeedbackDuplicate(id): Promise<Result<null>>`
  - Actions `setFeedbackStatusAction`, `markFeedbackDuplicateAction`, `unmarkFeedbackDuplicateAction` (each `requireRole("admin")`, `FormState`, `revalidatePath("/admin/feedback")`, then `sendEmailsAfterResponse()` after a status change so the "shipped" emails go out right away)

- [ ] **Step 1: Data functions and actions** as above.
- [ ] **Step 2: Page:** `FilterTabs` for status (`?status=`, default `received`) and kind (`?kind=`, default all), filtered in the app, paged (`QUEUE_PAGE_SIZE`). Each card: `#number`, title, details, kind, sent date, sender name · role · `mailto:` email, current note, "Duplicate of #n" with an unmerge button, or "n duplicates". One form: status select + note (prefilled) + Save; a second: "Mark as duplicate of #" + number input. Merged rows show only the unmerge control, not the status form. Skeleton fallback.
- [ ] **Step 3: Verify** on 3030 as the local admin: set the Task 5 request to Planned with a note → the sender's `/feedback` shows it; merge a second request into it; ship the main → both senders get a bell notification and an email row is queued (`select kind, email_due_at, emailed_at from notifications where kind = 'feedback_shipped'`); the admin home and sidebar show the received count. `npm run lint && npm run typecheck && npm test` pass.
- [ ] **Step 4: Commit** "Give admins a feedback queue with statuses and duplicates".

### Task 7: Finish

**Files:**
- Modify: `CLAUDE.md` (§8: one paragraph on `feedback_shipped`; §4 layout: `feedback/` under the portal and `contact/` under marketing), `docs/TODO.md` (anything deferred, e.g. notifying on `planned`/`not_planned`, contact messages not stored)

- [ ] **Step 1: Update the docs** above.
- [ ] **Step 2: Full check:** `npm run lint`, `npm run typecheck`, `npm test`, `supabase test db` on the throwaway instance, and a production build with local env overrides (memory: `.env.production.local` points at the live project; override `NEXT_PUBLIC_SUPABASE_URL`, the publishable key and `NEXT_PUBLIC_APP_URL`), `next start -p 3100`, load `/contact`, `/feedback`, `/admin/feedback`.
- [ ] **Step 3: Clean up** any `e2e-*@example.com` users created in the local DB.
- [ ] **Step 4: Commit** "Document the contact page and feedback loop", push, and open a PR against `main` noting it's stacked on #38 (merge #38 first), with the migration risk: two new migrations to push to the hosted project after merge (dry-run and ask first, per the hosted-Supabase memory).
