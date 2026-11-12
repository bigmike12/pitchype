# Stage 5: Applications, Chat and Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creators apply to campaigns, businesses review and approve them (creating an `awaiting_payment` engagement and a placeholder pay screen that lapses after 48 hours), the two sides chat in real time with contact details blocked, and accounts face graded strikes with appeals, while people can block each other.

**Architecture:** Three migrations, each with its own pgTAP file: enforcement first (standing, blocks, strikes, appeals), then applications and engagements, then chat. Every rule that protects money, places or standing lives in a `security definer` SQL function; RLS is default-deny and only reads go through policies. App code follows the existing pattern: pure rules in `src/lib/*.ts` with `node --test`, one `src/lib/db/<domain>.ts` per domain mapping SQL errors to typed results, server actions next to their routes, pages built from the design system (`docs/DESIGN_SYSTEM.md`, skeleton loading, 390px first).

**Tech Stack:** Next.js 16 (App Router, cacheComponents), React 19, TypeScript strict, Tailwind v4, Supabase (Postgres, Auth, Realtime via `@supabase/ssr` browser client), pgTAP, `node --test`, Playwright (from the npx cache) for browser checks.

**Spec:** `docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md`

## Global Constraints

- No new dependencies. No ledger, escrow, payout or hold code (spec §5): enforcement never touches an engagement's money state.
- Migrations are new files in `supabase/migrations/`; apply locally with `supabase migration up` (never `supabase db reset`: it deletes the user's local accounts). Regenerate types with `npm run db:types` after each.
- Every new table: RLS enabled, default deny. Every function: `security definer`, `set search_path = ''`, `revoke all … from public, anon`, granted to `authenticated` only where the app calls it (internal helpers granted to nobody; the cron function to `service_role` only).
- Functions raise with `errcode 'P0001'` and a stable lower_snake message (e.g. `campaign_full`); `src/lib/db/*` maps each to a typed reason. Permission failures use `42501`.
- Money is integer kobo; prices are whole naira, minimum ₦5,000 (`500000` kobo), maximum `MAX_PRICE_NAIRA`.
- Server actions: authenticate → authorize → validate → act (CLAUDE.md §7). Rate limits with the existing `createRateLimiter`.
- Copy: sentence case, curly quotes, no unverified numbers. Loading states are skeletons (`src/components/ui/skeleton.tsx`, `PageLoading`). Check every page at 390px.
- Each task ends with `npm run lint`, `npm run typecheck`, `npm test` (and `supabase test db` when SQL changed) passing, then a commit ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Browser checks: production build on port 3100 against local Supabase (override the three `NEXT_PUBLIC_*` variables; `.env.production.local` points at the live project), throwaway `e2e-*@example.com` accounts, deleted at the end. Never kill the user's dev server on 3030.

## Review Focus

1. **Two approvals at the same moment for the last place**: the second must fail with `campaign_full`, never over-fill. pgTAP covers it sequentially; Task 3 adds a two-connection check with `psql`.
2. **The creator edits their price while the business is on the page**: approving must fail with `price_changed` and show the new price. Pinned in Task 3 (pgTAP) and Task 6 (browser).
3. **A restricted or suspended person with existing work**: they can still read threads, applications and engagements, a business can still cancel an unpaid engagement, and nothing about the engagement changes. Pinned in Tasks 1 and 3 (pgTAP) and Task 9 (browser).
4. **Realtime unavailable** (container not running, network drop): sending still works and the sender sees their message; incoming messages appear on reload; nothing crashes. Pinned in Task 7 (browser, with Realtime stopped once).
5. **False positives**: prices (₦50,000), dates (12/12/2026), short numbers and @handles are not flagged; a long digit run is (and the appeal path clears it). Pinned in Task 1 (unit and pgTAP parity).

---

### Task 1: Enforcement migration (standing, blocks, strikes, appeals)

**Files:**
- Create: `supabase/migrations/20261110100000_create_moderation.sql`, `supabase/tests/moderation_rls.test.sql`
- Modify: `src/lib/contact-details.test.ts` (false-positive cases), `src/types/database.ts` (regenerated)

**Interfaces (SQL, all in `public`):**
- `users` gains `messaging_restricted_until timestamptz`, `suspended_at timestamptz` (no update policy; set only by functions).
- `user_blocks (blocker_id, blocked_id, created_at)`, PK pair, `check (blocker_id <> blocked_id)`; select policy: own rows as blocker.
- `moderation_event_kind` enum `strike | strike_voided | suspension_lifted | appeal_declined`. `moderation_events (id, user_id, kind, actor_id, strike_id, flag, detail, reason, dedupe_key uuid, created_at)` with checks: strike → actor null, flag and detail not null; others → actor and reason (2–200, trimmed) not null; void → strike_id not null; unique `(user_id, dedupe_key)`; unique `strike_id` where kind = `strike_voided`. A trigger raises on update or delete. Select policy: own rows; admins all.
- `moderation_appeals (id, user_id, message 2–1000, status 'open'|'answered', answer, created_at, resolved_by, resolved_at)`; unique open appeal per user (partial index). Select: own; admins all.
- Internal (granted to nobody): `active_strike_count(person uuid) → integer`, `standing_problem(person uuid) → text` (`account_suspended` | `activity_paused` | null), `check_standing(person uuid)` (raises `P0001` with that text), `is_blocked_between(a uuid, b uuid) → boolean`, `is_suspended(person uuid) → boolean`, `record_strike(person uuid, flag text, detail text, dedupe uuid) → jsonb` (inserts on conflict do nothing, then escalates: 2 active → `messaging_restricted_until = now() + interval '3 days'`; ≥3 → `suspended_at = coalesce(suspended_at, now())`; returns `{strikes, restricted_until, suspended}`), `contact_detail_kind(text) → text` (the four patterns of `src/lib/contact-details.ts`, translated to Postgres regex: `\y` for `\b`, `~*`).
- Granted to `authenticated`: `block_user(other uuid)`, `unblock_user(other uuid)` (both idempotent), `submit_appeal(message text) → uuid` (needs an active strike or a restriction or suspension; `appeal_open` if one is open; `appeal_too_soon` within 24 hours of the last), admin-only `void_strike(strike uuid, reason text)`, `lift_suspension(person uuid, reason text)`, `answer_appeal(appeal uuid, answer text, decline boolean)`, `standing_review() → jsonb` (suspended accounts with their strikes, campaigns and engagements once those tables exist (Task 2 replaces it), open appeals, strikes from the last 30 days). Voiding re-derives standing: fewer than 3 active clears `suspended_at`, fewer than 2 clears `messaging_restricted_until`.

- [ ] **Step 1:** Add the false-positive cases to `src/lib/contact-details.test.ts` (`₦50,000`, `12/12/2026`, `call me at 5pm`, `@brightside.ng`, `2 reels and 3 stories`) and a flagged one (`0803 123 4567 is my number`); run `npm test`: the new cases pass already (they pin current behaviour).
- [ ] **Step 2:** Write `moderation_rls.test.sql` first (style of `campaigns_rls.test.sql`: JWT claims per person, `plan(n)`), covering: blocks visible only to the blocker and idempotent; `record_strike` with the same dedupe key twice is one strike; 1 strike → nothing restricted; 2 → `messaging_restricted_until` about 3 days ahead and `check_standing` raises `activity_paused`; a past restriction no longer raises; 3 → `suspended_at` set and `account_suspended`; events can't be updated or deleted (even by the owner); non-admins can't see others' events or call the admin functions; `void_strike` and `lift_suspension` refuse an empty reason, voiding twice is a no-op, voiding at 3 strikes clears the suspension; one open appeal, a second refused, a resubmission inside 24 hours refused; `contact_detail_kind` agrees with the TS cases of Step 1 (same strings, same answers).
- [ ] **Step 3:** Run `supabase test db`: the new file fails (functions missing).
- [ ] **Step 4:** Write the migration (header comment listing the invariants, as in the campaigns migration), apply with `supabase migration up`, run `npm run db:types`.
- [ ] **Step 5:** `supabase test db`: all files pass. Then lint, typecheck, test.
- [ ] **Step 6:** Commit: "Add account standing, person-to-person blocks, strikes and appeals".

---

### Task 2: Applications and engagements migration

**Files:**
- Create: `supabase/migrations/20261110100100_create_applications.sql`, `supabase/tests/applications_rls.test.sql`
- Modify: `src/types/database.ts`

**Interfaces (SQL):**
- Enums `application_status` (`submitted, shortlisted, approved, rejected, withdrawn`) and `engagement_status` (the full CLAUDE.md §5 list).
- `applications` and `engagements` exactly as spec §7. Price check: null or `between 500000 and 10000000000 and % 100 = 0`. Note and decision note: trimmed, ≤500. `pay_by = approved_at + interval '48 hours'`.
- Policies (select only): creator sees own applications and engagements; business sees those on its campaigns; admins all.
- Internal: `held_places(campaign uuid) → integer` (engagements not `cancelled`/`refunded`).
- Granted to `service_role` only: `expire_unpaid_engagements(campaign uuid default null) → integer` (sets `cancelled`, `cancelled_at`, `cancel_reason = 'payment_expired'` where `awaiting_payment` and `pay_by < now()`; returns rows changed).
- Granted to `authenticated`:
  - `apply_to_campaign(campaign uuid, proposed_price_kobo bigint, note text) → uuid` — creator role; `check_standing`; caller in `listed_creators` else `profile_not_listed`; campaign `open` and not past `lagos_today()` else `campaign_closed`; `held_places < places` else `campaign_full`; `is_blocked_between(caller, business)` → `not_allowed`; `campaign_problems` non-empty → `not_eligible`; duplicate → `already_applied`.
  - `edit_application(application uuid, proposed_price_kobo bigint, note text)` — owner, status `submitted|shortlisted` else `application_locked`.
  - `withdraw_application(application uuid)` — owner, same statuses.
  - `decide_application(application uuid, decision text, note text)` — campaign owner; `shortlisted` (from `submitted`) or `rejected` (from `submitted|shortlisted`).
  - `approve_application(application uuid, expected_price_kobo bigint) → uuid` — campaign owner; `check_standing(caller)`; creator suspended → `creator_unavailable`; blocked → `not_allowed`; `select … for update` on the campaign; `expire_unpaid_engagements(campaign)`; campaign `open|paused` else `campaign_closed`; application `submitted|shortlisted` else `application_locked`; agreed = proposal or campaign price, ≠ expected → `price_changed`; held ≥ places → `campaign_full`; inserts the engagement, sets the application `approved`; returns the engagement id.
  - `cancel_engagement(engagement uuid)` — campaign owner; only `awaiting_payment` (`cancel_reason = 'cancelled_by_business'`); otherwise `engagement_locked`. No standing check (it ends something).
  - `campaign_applications(campaign uuid) → jsonb` — owner or admin: each application with status, price, note, dates, engagement (id, status, pay_by), and the creator (display name, slug, photo version, city, state, niches, platforms with handle and follower range or verified count, rate, bio, `suspended`, `blocked` either way).
  - `my_applications() → jsonb` — creator: each with campaign (id, title, business name, status, price, closes), engagement status and `pay_by`, and `brief_edited_at` (latest `campaign_revisions.while_live` after the application was made).
  - `campaign_application_counts() → table (campaign_id uuid, total integer, waiting integer)` — the caller's campaigns.
- Changes: `campaigns_before_write` refuses `places < held_places(id)` (`places_below_held`); `list_open_campaigns` and `open_campaign_count` leave out full campaigns and suspended businesses; `listed_creators` is recreated with `and not public.is_suspended(p.user_id)`; `standing_review()` is replaced to include each suspended person's campaigns and engagements.

- [ ] **Step 1:** Write `applications_rls.test.sql` first: each refusal code above; the unique application; RLS for both roles and a stranger; over-fill with places = 1 (second approval `campaign_full`); `price_changed` after an edit; lapse: backdate `pay_by`, run `expire_unpaid_engagements()` twice (second returns 0), place freed; places can't drop below held; a blocked pair can't apply or approve and their existing application and engagement are unchanged; a suspended creator drops out of `listed_creators` and `list_open_campaigns` drops a suspended business's campaign, with both rows unchanged; `cancel_engagement` works for a restricted business; no Task 1 function changes an engagement.
- [ ] **Step 2:** `supabase test db`: fails.
- [ ] **Step 3:** Write the migration; `supabase migration up`; `npm run db:types`.
- [ ] **Step 4:** `supabase test db` passes. Then, Review Focus 1: open two `psql` sessions as the same business (set the JWT claims), `begin;` both, call `approve_application` on two applications for a 1-place campaign; commit the first; the second returns `campaign_full`. Record the result in the ledger.
- [ ] **Step 5:** lint, typecheck, test; commit: "Add applications and engagements that never over-fill a campaign".

---

### Task 3: Chat migration

**Files:**
- Create: `supabase/migrations/20261110100200_create_chat.sql`, `supabase/tests/chat_rls.test.sql`
- Modify: `src/types/database.ts`

**Interfaces (SQL):**
- `conversations (id, business_id, creator_id, application_id null, created_at)`, unique `(business_id, creator_id)`; `messages (id, conversation_id, sender_id, body 1–2000 trimmed, dedupe_key uuid, created_at)`, unique `(sender_id, dedupe_key)`; `conversation_reads (conversation_id, user_id, last_read_at)`, PK pair. Select policies: participants (and admins for conversations only). No insert/update/delete policies.
- `start_conversation(creator uuid, application uuid default null) → uuid` — business role; `check_standing`; blocked → `not_allowed`; creator must be listed or have applied to one of the caller's campaigns, else `not_allowed`; returns the existing id if the pair already has one.
- `send_message(conversation uuid, body text, dedupe uuid) → jsonb` — participant else `not_allowed`; `check_standing`; blocked → `not_allowed`; length; if `contact_detail_kind(body)` → `record_strike(caller, kind, body, dedupe)` and returns `{delivered: false, flag, strikes, restricted_until, suspended}`; else inserts (on conflict do nothing) and returns `{delivered: true}`.
- `mark_conversation_read(conversation uuid)`, `my_conversations() → jsonb` (other person's name and photo, last message, unread count, `blocked_by_me`, `blocked`), `unread_message_count() → integer`.
- `messages` added to the `supabase_realtime` publication when it exists (guarded `do` block).

- [ ] **Step 1:** Write `chat_rls.test.sql` first: only the business can start; idempotent start; a stranger can't read or send; a creator replies; a flagged message is not stored, returns a strike, and its text is not visible to the other person; three flagged messages suspend and a fourth send raises `account_suspended`; a restricted sender raises `activity_paused`; a block either way stops sending but both can still read the thread; same dedupe key twice stores one message; unread count and mark-read.
- [ ] **Step 2–4:** fail, write and apply the migration, regenerate types, pass; lint, typecheck, test.
- [ ] **Step 5:** Commit: "Add chat that never delivers contact details".

---

### Task 4: Rules, data access and the browser client

**Files:**
- Modify: `src/lib/campaign.ts` (export `parsePrice`), `src/lib/portal.ts` (+ test), `src/components/shells/portal-nav.tsx` (icons), `docs/PROVIDERS.md`
- Create: `src/lib/applications.ts` (+ `.test.ts`), `src/lib/moderation.ts` (+ `.test.ts`), `src/lib/db/applications.ts`, `src/lib/db/chat.ts`, `src/lib/db/moderation.ts`, `src/lib/supabase/browser.ts`

**Interfaces:**
- `parseApplicationForm(form: FormData, campaignPriceKobo: number): Parsed<{ proposedPriceKobo: number | null; note: string | null }, "price" | "note">` — empty price or the campaign price means null; otherwise `parsePrice` rules; note ≤500, refused if `findContactDetails` finds anything ("Remove the …").
- `standingView(s: { activeStrikes: number; restrictedUntil: string | null; suspendedAt: string | null }, now: Date): { state: "clear" | "warned" | "paused" | "suspended"; until: string | null }`; `flagMessage(flag: string, strikes: number): string`; `RESTRICT_DAYS = 3`.
- Nav: `NavIcon` adds `applications`, `inbox`. Business: Home, Campaigns, Find creators, Inbox (`/inbox`). Creator: Home, Campaigns, Applications (`/applications`), Your profile, Inbox. Admin unchanged.
- `src/lib/db/*` functions return `{ ok: true, … } | { ok: false, reason }`, reasons being the SQL message codes; one per SQL function above plus reads (`getStanding(userId)`, `listMyBlocks()`, `listMyEvents()`, `listMyAppeals()`). `expireUnpaidEngagements()` uses `createAdminClient()`.
- `createBrowserClient()` in `src/lib/supabase/browser.ts` (publishable key only), used only for Realtime subscriptions.

- [ ] **Step 1:** Tests first for `parseApplicationForm` (empty, campaign price, ₦4,999, ₦5,000.50, "50,000", a phone number in the note), `standingView` (each state, an expired pause reads as `warned`), `flagMessage`, and the new nav arrays and active matching (`/inbox/abc` activates Inbox). Run: fail.
- [ ] **Step 2:** Implement; tests pass; write the db modules and the browser client; add Realtime to `docs/PROVIDERS.md`.
- [ ] **Step 3:** lint, typecheck, test; commit: "Add the rules and data access for applications, chat and standing".

---

### Task 5: Creators apply

**Files:** `src/app/(portal)/(influencer)/campaigns/[id]/page.tsx` and a new `apply-form.tsx` + `actions.ts` additions; new `src/app/(portal)/(influencer)/applications/page.tsx` (+ `actions.ts`).

- Campaign page: if no application, the apply form (price prefilled with the campaign price, a "what you'd receive" line from `creatorReceivesKobo`, note) replacing "Applying opens soon"; otherwise the application status as a `Callout` with Edit (while `submitted|shortlisted`), Withdraw, and "The brief was edited on …" when `brief_edited_at` is set. Refusals map to words (`campaign_full`: "All places are taken", `not_eligible`: the existing problem list, `profile_not_listed`: link to publish, `activity_paused` / `account_suspended`: link to `/account/standing`, `not_allowed`: "You can’t apply to this campaign").
- `/applications`: `PageHeader`, a list (table from 640px) of `my_applications()` with status pills (new tones in `campaign-facts.tsx` style: submitted, shortlisted, approved → "Hired, waiting for payment", rejected, withdrawn), `EmptyState` linking to campaigns, a skeleton fallback.
- [ ] Build, then lint/typecheck/test, then the browser check (Task 10 runs the full sweep; here: apply, edit, withdraw at 390px and 1280px on a fresh build). Commit: "Let creators apply to campaigns, edit and withdraw".

---

### Task 6: Businesses review and approve

**Files:** new `src/app/(portal)/(business)/business/campaigns/[id]/applications/page.tsx` (+ `actions.ts`, `application-card.tsx`), new `src/app/(portal)/(business)/business/engagements/[id]/pay/page.tsx` (+ cancel action); `src/components/campaigns/campaign-table.tsx` and the campaign page (application counts and a link).

- Applications page: crumbs Campaigns / title; tabs by status via `?status=` links (no new component); each card: creator photo, name (link to `/business/creators/[slug]`), location, niches, platforms, proposed price against the campaign price ("Asks ₦60,000 · campaign price ₦50,000"), note, dates; actions Shortlist, Reject (with an optional note), Approve (a `<dialog>` confirm showing price, fee and total from `feeExample`, posting `expected_price_kobo`), Message (Task 7), Block (Task 8). `price_changed` reloads the card with "The creator changed their price to …".
- Pay page: `PageHeader` "Pay to start the job"; creator and campaign; price, fee, total; the non-refundable-fee notice (CLAUDE.md §6.2); time left until `pay_by` (formatted in Lagos time); a disabled "Pay with Paystack" and the line "Payments open soon"; Cancel this hire (confirm). Expired or cancelled: a `Callout` saying so.
- [ ] Build; lint/typecheck/test; browser: approve to the pay page, Review Focus 2 (edit the price in a second browser context between load and approve), cancel, a backdated lapse showing as lapsed. Commit: "Let businesses review applicants and approve them to a pay step".

---

### Task 7: Chat

**Files:** new `src/app/(portal)/inbox/page.tsx`, `src/app/(portal)/inbox/[id]/page.tsx`, `thread.tsx` (client), `composer.tsx` (client), `actions.ts`; `src/app/(portal)/chrome.tsx` and `portal-nav.tsx` (unread badge); Message buttons on the application card and `/business/creators/[slug]` (replacing the "open soon" callout); creator home and account copy that still says messaging opens soon.

- Inbox: list from `my_conversations()` (unread dot, last message, time), `EmptyState` per role ("Businesses start conversations" for creators).
- Thread: messages server-rendered; `Thread` subscribes with `createBrowserClient()` to inserts on `messages` filtered by `conversation_id` and calls `router.refresh()`; unsubscribes on unmount. `Composer` keeps a `dedupe` uuid per draft (`crypto.randomUUID()`, renewed after each send), posts to `sendMessageAction` (authenticate, participant check by the function, rate limit 20/min, length); on `delivered: false` shows a danger `Callout` with `flagMessage(flag, strikes)` and a link to `/account/standing`, and keeps the text so they can fix it. Blocked or not allowed: the composer is replaced by a line saying messaging isn't available. `mark_conversation_read` on open.
- [ ] Build; lint/typecheck/test; browser: business starts from an application and from a profile, creator replies, live delivery between two contexts, a flagged message not delivered with the warning, Review Focus 4 (stop the Realtime container: send still works, incoming on reload). Commit: "Add the inbox and live chat".

---

### Task 8: Blocking and account standing

**Files:** `src/app/(portal)/account/standing/page.tsx` (+ `actions.ts`), `src/app/(portal)/account/page.tsx` ("Blocked people"), block/unblock actions (in `src/app/(portal)/account/actions.ts`) and buttons in the thread header, application card and business creator profile; a standing banner in `src/app/(portal)/chrome.tsx` (or the portal layout) for `paused` and `suspended`.

- Standing page: current state (`standingView`) as a `Callout`, the strikes (date, what was flagged, voided or not), the appeal form (or the open appeal and past answers), with `appeal_open` and `appeal_too_soon` in words.
- Block confirm uses a `<dialog>` explaining what changes ("You won’t be able to message each other or start new work together. Existing work and payments carry on.").
- [ ] Build; lint/typecheck/test; browser: block from a thread and unblock from Account; second strike banner and refused apply; appeal submitted. Commit: "Let people block each other and see their standing".

---

### Task 9: Admin standing review and the lapse job

**Files:** `src/app/(portal)/(admin)/admin/page.tsx` (+ `actions.ts`, a `standing-review.tsx` section); new `src/app/api/cron/expire-engagements/route.ts`; new `vercel.json`; `.env.example` (`CRON_SECRET`).

- Admin section from `standing_review()`: suspended accounts (name, role, strikes with flagged text, their campaigns and engagements, read-only), open appeals, recent strikes; Void strike, Lift suspension, Answer/Decline, each a small form whose reason is required (2–200).
- Route: `GET`; responds 401 unless `Authorization: Bearer ${CRON_SECRET}` (and `CRON_SECRET` is set); calls `expireUnpaidEngagements()`; returns `{ expired: n }`. `vercel.json`: `{"crons":[{"path":"/api/cron/expire-engagements","schedule":"0 * * * *"}]}`.
- [ ] Build; lint/typecheck/test; browser: admin voids a strike (suspension lifts), declines an appeal (person sees the answer), lifts a suspension; `curl` the route without and with the secret. Commit: "Add the admin standing review and the hourly lapse job".

---

### Task 10: Docs, full browser sweep, cleanup

**Files:** `CLAUDE.md` (§6.5 "Enforcement and money" with the spec §5 rules; §12 "Decided in Stage 5"; §5 note that `awaiting_payment` lapses after 48 hours), `docs/DESIGN_SYSTEM.md` (new pages and patterns), `docs/TODO.md` (tick the two Stage 4 follow-ups; add spec §11 items), `README.md` (Stage 5, `CRON_SECRET`, Realtime needs the realtime container locally), spec status line.

- [ ] Start local Supabase with Realtime (`supabase stop && supabase start -x studio,edge-runtime,logflare,vector,supavisor,postgres-meta,imgproxy`; data is kept) and note it in the memory file.
- [ ] Full Playwright sweep on a production build (every new page at 390px and 1280px, all Review Focus items), Lighthouse accessibility on `/applications`, `/inbox/[id]` and `/account/standing`, `supabase test db`, lint, typecheck, test.
- [ ] Delete every `e2e-*` account and its rows; stop the 3100 server.
- [ ] Commit: "Document Stage 5: applications, chat and account standing".
