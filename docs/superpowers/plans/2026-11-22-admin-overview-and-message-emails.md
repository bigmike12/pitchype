# Admin Overview and Message Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send unread-message emails after 6 hours and only to people who want them (off by default for new users), and show platform counts and money figures on the admin home.

**Architecture:** Two independent tasks. Task 1 changes numbers and defaults in the existing email queue (`notify()`, `claim_due_emails()`, `notification_preferences`) plus the TS defaults and label. Task 2 adds one admin-only SQL function reading `users`, `campaigns`, `ledger_entries` and `payouts`, and a "Platform" section on the admin home.

**Tech Stack:** Next.js App Router + TypeScript, Supabase Postgres (plpgsql, pgTAP), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-22-admin-overview-and-message-emails-design.md`

## Global Constraints

- Read `CLAUDE.md` fully first. Branch `pre-merge-updates` (already created, stacked on `identity-verification`). One commit per task with an accurate `Co-Authored-By:` trailer for the model you are. Do not merge or push.
- New migrations only: `supabase/migrations/20261124HHMMSS_<what>.sql`; `create or replace` from the **latest** definition (`grep -n "function public.<name>(" supabase/migrations/*.sql`, last file). Apply with `supabase migration up` — **never `supabase db reset`**; then `npm run db:types`.
- Verify each task with `supabase test db` (the owner's local DB has four known failures: `funding.test.sql` 1, 92, 93 and `settlement.test.sql` 114 — leave them), `npm test`, `npm run lint`, `npm run typecheck`.
- `.env.production.local` is the LIVE database: never build without local overrides; never touch the live database; never stop processes you didn't start (dev server on 3030). No new npm dependencies.
- Stop and report if an existing assertion would have to change for reasons other than the 15-minute/1-hour/default-true numbers this plan deliberately changes.

## Review Focus

1. **Someone with no saved preferences row** (most existing users) → keeps getting chat emails after the migration; a user created after it → doesn't. Test: Task 1 pgTAP.
2. **A thread read 5 hours after the message** → no email at 6 hours. Test: Task 1 (existing skip-if-read path, with the new delay).
3. **A reversed Cray payout** → not counted in "Paid out to creators". Test: Task 2 pgTAP.
4. **A per-click hire whose unspent fee went back to the business** → revenue counts only the fee kept. Test: Task 2 pgTAP.
5. **A non-admin calling the overview function** → refused. Test: Task 2 pgTAP.

---

### Task 1: Unread-message emails after 6 hours, off by default for new users

**Files:**
- Create: `supabase/migrations/20261124100000_message_email_defaults.sql`, `supabase/tests/message_email_defaults.test.sql`
- Modify: `src/lib/notification-email.ts` (+ test), `src/app/(portal)/account/email-preferences-form.tsx`, any existing pgTAP/node test asserting 15 minutes, one hour or a `true` default for messages (update only those numbers), `CLAUDE.md` §8, `docs/PROVIDERS.md` (send-emails row)

**Interfaces:**
- Produces: migration that (in this order) inserts `notification_preferences (user_id, true, true, true)` for every `users` row without one; `alter column email_messages set default false`; `create or replace notify()` with `interval '6 hours'` for `new_message` and the per-thread re-arm cap at `interval '6 hours'`; `create or replace claim_due_emails()` with `coalesce(p.email_messages, false)`. TS: `DEFAULT_EMAIL_PREFERENCES.messages === false` (or whatever the existing constant is named), label "Messages (only if you haven’t read them after 6 hours)".

- [ ] **Step 1: Failing pgTAP** `message_email_defaults.test.sql`: an existing user without a row (created before the migration in the test via a direct insert that simulates "before": insert the user, delete their prefs row, then call the backfill logic if you expose it as a function `backfill_message_email_preferences()`; otherwise assert on a user created in the fixture with an explicit row) — keep it honest: assert (a) the column default is false, (b) `claim_due_emails` treats a user with no row as messages-off, (c) a `new_message` notify sets `email_due_at` ≈ now + 6 h, (d) a second message in the same thread within 6 h of an email doesn't re-arm it.
- [ ] **Step 2:** `supabase test db` → new file fails.
- [ ] **Step 3:** write the migration; `supabase migration up`; update the numbers in existing tests that assert the old values; `supabase test db` green (bar the four known).
- [ ] **Step 4:** TS default + label + docs; `npm test`, typecheck, lint.
- [ ] **Step 5: Commit** `Email unread messages after 6 hours, off by default for new people`.

### Task 2: Platform figures on the admin home

**Files:**
- Create: `supabase/migrations/20261124100100_admin_platform_overview.sql`, `supabase/tests/admin_platform_overview.test.sql`
- Modify: `src/lib/db/money.ts` (or a new `src/lib/db/admin-overview.ts`), `src/types/database.ts`, `src/app/(portal)/(admin)/admin/page.tsx` (and its skeleton)

**Interfaces:**
- Produces: `admin_platform_overview() returns jsonb` exactly as the spec §B defines (`businesses`, `creators`, `campaigns_total`, `campaigns_live`, `paid_in_kobo`, `paid_out_kobo`, `revenue_kobo`, `as_of`); admin role checked inside (`'not_an_admin'`), `security definer`, `search_path = ''`, granted to `authenticated` only. TS `getPlatformOverview(): Promise<{ businesses: number; creators: number; campaignsTotal: number; campaignsLive: number; paidInKobo: number; paidOutKobo: number; revenueKobo: number; asOf: string }>`; `isPaymentTestMode(): boolean` (server-only, from the active provider: Paystack `PAYSTACK_SECRET_KEY` starts `sk_test_`; Cray `CRAY_BASE_URL` contains `sandbox`; unset credentials count as test mode).
- UI: a "Platform" section above the queues with `StatCard`s (existing component) for Businesses, Creators, Campaigns ("N live" as the sub-line), then a money row: "Paid in by businesses", "Paid out to creators", and "Pitchype revenue" with the sub-line "Our fees, after refunds" in a visually separate card; "Test mode" label on the three money cards when `isPaymentTestMode()`. Skeleton updated to the new shape.

- [ ] **Step 1: Failing pgTAP:** non-admin refused; with a fixture of 2 businesses, 3 creators, 1 admin, campaigns in draft/open/in_progress/completed, one card payment (₦52,500 cash in), one deposit (₦20,000 net cash in), a settled release (creator fee kept), a paid payout and a reversed payout, and a per-click settlement that returns part of the business fee: assert each figure equals the hand-computed value (Review Focus 3–5). Use the existing money functions to build the fixture, not direct ledger inserts.
- [ ] **Step 2–3:** fail → migration → `supabase migration up` → green.
- [ ] **Step 4:** `npm run db:types`; wrapper; page; `npm test`, typecheck, lint; local build with overrides if you can.
- [ ] **Step 5: Commit** `Show platform counts and money on the admin home`.

Final report: commits, every command and result, what you couldn't verify (browser), deviations and why.
