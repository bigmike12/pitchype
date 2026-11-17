# Stage 7: Submissions, Review, Auto-release and Disputes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A creator submits proof on a started job; the business accepts (escrow released) or denies with reasons; up to 3 resubmissions; 7-day auto-release; either side can open a dispute that an admin decides.

**Architecture:** All state changes and money moves are `security definer` Postgres functions in new migrations, calling the existing `settle_money()` through a widened `settle_engagement_internal()`. Next.js Server Actions call them through new `src/lib/db/submissions.ts` and `src/lib/db/disputes.ts`. Proof screenshots go to a private `work-proof` bucket through `src/lib/storage.ts`. A daily cron route releases overdue hires and sends reminders.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (pgTAP via `supabase test db`), sharp (already used for profile photos), node:test.

**Spec:** `docs/superpowers/specs/2026-11-17-stage-7-submissions-disputes-design.md` (read it first; §11 holds the calls made after the builder check). Project rules: `CLAUDE.md` §5, §6, §6.6, §8.

## Global Constraints

- Amounts are `bigint` kobo; never floats. Fees come from the engagement's snapshot via `settle_money()`; no new fee maths.
- Every money move goes through `settle_engagement_internal()` → `settle_money()`. No new ledger writers.
- Lock order in every function: business `users` row `for no key update`, then the engagement `for update`, then the submission/dispute row.
- New functions: `security definer`, `set search_path = ''`, check the caller inside, `revoke all ... from public, anon` then explicit grants. Refusals are `raise exception '<code>' using errcode = 'P0001'` with a code added to `src/lib/refusals.ts`.
- Suspension and strikes don't stop running work (§6.5): submit, accept, deny, dispute and withdraw do **not** call `check_standing()`.
- Resubmissions: at most 3, so `round` is 1–4. Review window: exactly 7 days from each submission (`now() + interval '7 days'`). Reminders at 3 days and 1 day left.
- Proof: 1–10 links (`http://` or `https://`, ≤ 500 chars each), 0–5 screenshots (JPEG/PNG/WebP, ≤ 5 MB each, stored as WebP, longest side 2,000 px, metadata stripped), note ≤ 1,000 chars; at least one link or one screenshot.
- Denial: 1–5 reasons, each 3–500 chars after trim. Dispute reason: 20–2,000 chars. Statements: 1–2,000 chars.
- Non-delivery dispute allowed from `in_progress` once `now() >` the later of (`campaigns.deliver_by` + 1 day at 00:00 Africa/Lagos) and (`started_at + 7 days`).
- The Stage 6 admin tool `settle_engagement()` keeps settling only `funded`/`in_progress`.
- Notifications never go to the person who acted. Email is out of scope.
- Every new page: skeleton loading state (`PageLoading` + `skeleton.tsx`), tokens only, works at 390 px.
- Migrations are new files only; apply locally with `supabase migration up` (never `supabase db reset`: it deletes the user's local accounts). Regenerate types with `npm run db:types`.
- Before each commit: `npm run lint && npm run typecheck && npm test`, and `supabase test db` for SQL tasks.

## Review Focus

1. **A business acting at the exact deadline.** Deny or accept after `review_deadline_at` must auto-release (status `auto_released`), never deny; the denial is not saved. Test in Task 2.
2. **A creator resubmitting while a dispute is open, or after the 4th round.** Must be refused (`engagement_locked` because the hire is `disputed`; `no_rounds_left`). Test in Tasks 1 and 3.
3. **Uploaded screenshots that never get attached** (form error after upload, closed tab). Orphans older than a day are deleted by the daily job; a file id owned by someone else must be refused. Test in Tasks 1 and 6.
4. **The business's own accept notifying the business**, and an auto-release notice the creator can't tell from a manual accept. Test in Task 4.
5. **An admin settling a `disputed` hire from the old escrow page** and leaving the dispute `open`. Must be refused (`engagement_locked`). Test in Task 3.

---

### Task 1: Submissions schema, submit, accept, deny, creator withdraw

**Files:**
- Create: `supabase/migrations/20261117100000_create_submissions.sql`
- Create: `supabase/tests/submissions.test.sql`
- Modify: `src/lib/refusals.ts` (new codes)

**Interfaces:**
- Consumes: `settle_money(...)` (unchanged), `engagements`, `campaigns`, `current_user_id()`, `current_user_role()`.
- Produces (SQL):
  - tables `submissions`, `proof_files`, bucket `work-proof`
  - `settle_engagement_internal(engagement uuid, outcome text, release_kobo bigint, reason text, actor uuid, release_status public.engagement_status default 'accepted') returns void`
  - `submit_work(engagement uuid, note text, links text[], file_ids uuid[]) returns uuid` (submission id)
  - `accept_submission(engagement uuid) returns text` → `'accepted' | 'auto_released'`
  - `deny_submission(engagement uuid, reasons text[]) returns text` → `'denied' | 'review_closed'`
  - `withdraw_from_engagement(engagement uuid) returns void`
  - `release_if_overdue(e public.engagements) returns boolean` (internal, no grant)
  - `register_proof_file(owner uuid, path text, content_type text, bytes integer) returns uuid` (service role)
- Refusal codes added: `no_rounds_left`, `review_closed`, `proof_required`, `proof_invalid`, `reasons_required`, `dispute_open`, `not_your_file`.

- [ ] **Step 1: Write `submissions.test.sql`** following `settlement.test.sql`'s setup style (users, campaign, funded + started hires via the same inserts that test uses). Assertions, each one `ok`/`is`/`throws_ok`:
  - another creator calling `submit_work` → `no_such_engagement`; a `funded` (not started) hire → `engagement_locked`.
  - `submit_work` with no links and no files → `proof_required`; 11 links or an `ftp://` link → `proof_invalid`.
  - valid submit → engagement `submitted`, submission round 1 `pending_review`, `review_deadline_at = now() + interval '7 days'` (within the transaction `now()` is fixed, so `is()` exact).
  - `deny_submission(e, '{}')` → `reasons_required`; reason `'ok'` (2 chars) → `reasons_required`.
  - deny with `{"Wrong hashtag"}` returns `'denied'`; engagement `denied`; submission `denied` with that reason.
  - resubmit → round 2; after denying rounds 2, 3, 4, a 5th `submit_work` → `no_rounds_left`.
  - `accept_submission` by the business → returns `'accepted'`; engagement `accepted`; creator wallet credited ₦47,500 for ₦50,000 (`wallet_balance()`); submission `accepted`; calling it again → `engagement_locked` and no new ledger rows.
  - creator `withdraw_from_engagement` on `in_progress` → engagement `refunded`, business wallet = price + business fee − that payment's Paystack charge (reuse the settlement test's numbers); on `submitted` → `engagement_locked`.
  - Stage 6 `settle_engagement` (admin) on a `submitted` hire → `engagement_locked`.
  - `anon`/`authenticated` can't `insert`/`update`/`delete` on `submissions` or `proof_files`; RLS: the creator and business of the hire and admins `select` the submission, another business sees 0 rows.
  - `submit_work` with a file id registered by another user → `not_your_file`; with an already-attached file id → `not_your_file`.

- [ ] **Step 2: Run** `supabase test db` → FAIL (functions don't exist).

- [ ] **Step 3: Write the migration.** Header comment lists the invariants (spec §3, §5). Contents:
  - `submissions` per spec §5 (`round smallint check (round between 1 and 4)`, unique `(engagement_id, round)`, partial unique index on `engagement_id where status = 'pending_review'`, check that `denial_reasons` is non-empty iff `status = 'denied'`, `reminded_3d_at`, `reminded_1d_at`).
  - `proof_files (id, owner_id, path unique, content_type, bytes, submission_id null, dispute_statement_id null, created_at)` with check "not both parents". (Named `proof_files` rather than the spec's `submission_files` because disputes use it too.)
  - `insert into storage.buckets` for `work-proof`: private, `file_size_limit` 5 MB, `allowed_mime_types` `{image/webp}`; no `storage.objects` policies (server-only, like `profile-photos`).
  - Drop the old 5-argument `settle_engagement_internal` and recreate with `release_status`; status check widened to `funded, in_progress, submitted, denied, disputed`; on release it passes `case when released > 0 then release_status else 'refunded' end`. Recreate `settle_engagement` (admin) to check `e.status in ('funded','in_progress')` itself before calling (raise `engagement_locked` otherwise). Restate the Stage 6 grants and revokes for both.
  - `release_if_overdue(e)`: if `e.status = 'submitted'` and its `pending_review` submission's `review_deadline_at <= now()`, mark the submission `auto_accepted` (`decided_at = now()`, `decided_by = null`) and call `settle_engagement_internal(e.id, 'release', null, 'auto_released', null, 'auto_released')`; return true.
  - `accept_submission`/`deny_submission`: take locks, check the caller is the business, `release_if_overdue` first (accept then returns `'auto_released'`; deny returns `'review_closed'` without raising), else act. Accept calls `settle_engagement_internal(e.id, 'release', null, 'accepted', me)`.
  - `submit_work`: caller is the creator; allowed from `in_progress`, or `denied` when the latest round < 4 (a `disputed` hire is refused by this status check, so no dispute lookup is needed); attach `file_ids` (must be owned by the caller, unattached, ≤ 5).
  - `withdraw_from_engagement`: creator only; from `in_progress` or `denied`; `settle_money(..., 'refund_creator_fault', 0, true, 'refunded', null, me, 'creator_withdrew')`. Note: `refunded` + `cancel_reason null` so it is announced as a settlement, not a cancellation.
  - Comment on the enum: `paid_out` stays unused (spec §2).
  - RLS select policies on `submissions` and `proof_files` (creator, business of the hire, admins); `revoke all` from `anon, authenticated`; grant `select` to `authenticated`.

- [ ] **Step 4:** `supabase migration up && supabase test db` → all pass (old tests included: `settlement.test.sql` must still pass unchanged).

- [ ] **Step 5:** Add the refusal codes and their words to `src/lib/refusals.ts`; `npm run db:types && npm run typecheck && npm test`.

- [ ] **Step 6: Commit** `Add submissions with accept, deny and creator withdraw`.

### Task 2: Auto-release job and reminders

**Files:**
- Create: `supabase/migrations/20261117100100_auto_release.sql`
- Create: `supabase/tests/auto_release.test.sql`
- Create: `src/app/api/cron/review-deadlines/route.ts`
- Modify: `vercel.json`, `src/lib/db/submissions.ts` (create here; Task 6 adds the rest)

**Interfaces:**
- Consumes: `release_if_overdue(e)` from Task 1.
- Produces: `release_overdue_submissions() returns integer`, `send_review_reminders() returns integer`, `delete_orphan_proof_files() returns setof text` (paths to delete from storage), all `service_role` only. TS: `releaseOverdueSubmissions(): Promise<number>`, `sendReviewReminders(): Promise<number>`, `deleteOrphanProofFiles(): Promise<string[]>` in `src/lib/db/submissions.ts`.

- [ ] **Step 1: Write `auto_release.test.sql`.** Set `review_deadline_at` into the past with a direct update as the test owner. Assert:
  - `release_overdue_submissions()` releases only `submitted` hires past the deadline (returns 1 with one overdue + one not yet due + one `denied` with a past deadline); the hire is `auto_released`, the submission `auto_accepted`, the creator wallet credited net of fee.
  - running it twice: second call returns 0, ledger row count unchanged.
  - a business `deny_submission` on an overdue hire returns `'review_closed'`, the hire is `auto_released`, and the submission has no `denial_reasons`.
  - `accept_submission` on an overdue hire returns `'auto_released'`.
  - `send_review_reminders()`: deadline in 2.5 days → one `review_reminder` with `data->>'days_left' = '3'`; deadline in 20 hours → `'1'`; second run sends nothing; `authenticated` can't execute any of the three functions.
  - `delete_orphan_proof_files()` returns and deletes rows with no parent older than 1 day and keeps newer ones and attached ones.
  (`review_reminder` is a notification kind added in Task 4: order the migration files so Task 4's enum values come first, i.e. Task 4's file is `20261117100050_stage7_notification_kinds.sql` holding only the `alter type ... add value` lines, created in this task.)

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3:** migrations: `20261117100050_stage7_notification_kinds.sql` (add `work_submitted`, `submission_denied`, `review_reminder`, `dispute_opened`, `dispute_statement`, `dispute_withdrawn`); `20261117100100_auto_release.sql` with the three functions. Reminders: 3-day reminder when `review_deadline_at - now() <= 3 days and reminded_3d_at is null`, 1-day when `<= 1 day and reminded_1d_at is null`; when both are due only the 1-day one is sent and both columns are set. Facts: `campaign_id`, `campaign_title`, `engagement_id`, `name` (creator), `review_deadline_at`, `days_left`.

- [ ] **Step 4:** cron route mirrors `expire-engagements/route.ts`: `authorised()` → release → reminders → orphans (delete the returned paths via `deleteProofObjects(paths)` from Task 6's `storage.ts`; until Task 6 lands, leave the route returning the count of orphan rows and wire storage in Task 6). Response `{ released, reminded, orphans }`; any step throwing → 500 after attempting the others. Add `{ "path": "/api/cron/review-deadlines", "schedule": "15 3 * * *" }` to `vercel.json`. Unit test the route's step-ordering and 500 rule in `src/app/api/cron/review-deadlines/route.test.ts` with the db functions injected (follow `money-checks.test.ts`).

- [ ] **Step 5:** `supabase migration up && supabase test db && npm run db:types && npm run typecheck && npm test` → pass.

- [ ] **Step 6: Commit** `Auto-release overdue submissions and remind businesses`.

### Task 3: Disputes

**Files:**
- Create: `supabase/migrations/20261117100200_create_disputes.sql`
- Create: `supabase/tests/disputes.test.sql`
- Modify: `src/lib/refusals.ts`

**Interfaces:**
- Consumes: `settle_engagement_internal(..., release_status)` from Task 1; `proof_files`.
- Produces: tables `disputes`, `dispute_statements`; functions
  - `open_dispute(engagement uuid, reason text, links text[], file_ids uuid[]) returns uuid`
  - `add_dispute_statement(dispute uuid, body text, links text[], file_ids uuid[]) returns uuid`
  - `withdraw_dispute(dispute uuid) returns void`
  - `decide_dispute(dispute uuid, outcome text, release_kobo bigint, reason text) returns void` (admin; outcome `release | refund | split | refund_creator_fault`)
  - `accept_submission` recreated to accept on `disputed` too (closing the dispute).
  - `open_dispute` on a `disputed` hire raises `dispute_open`.
- Refusal codes: `dispute_not_allowed_yet`, `dispute_reason_invalid`, `statement_invalid`, `no_such_dispute`, `dispute_closed`.

- [ ] **Step 1: Write `disputes.test.sql`.** Assert:
  - creator `open_dispute` on `in_progress` → `not_allowed`; on `denied` → ok, hire `disputed`, `opened_from = 'denied'`.
  - business on `in_progress` before the non-delivery date → `dispute_not_allowed_yet`; after it (set `started_at` 8 days back and `deliver_by` to yesterday) → ok, `opened_from = 'in_progress'`; with `deliver_by` yesterday but `started_at` 2 days ago → `dispute_not_allowed_yet`.
  - business on `submitted` → `engagement_locked`.
  - a second `open_dispute` while one is open → `dispute_open`; `submit_work` while disputed → `engagement_locked`.
  - reason of 19 chars → `dispute_reason_invalid`.
  - statements: both people and an admin can add; a third user → `no_such_dispute`; `update`/`delete` on `dispute_statements` raise (append-only trigger), even as the table owner.
  - `withdraw_dispute` by the non-opener → `not_allowed`; by the opener → dispute `withdrawn`, hire back to `opened_from`.
  - `decide_dispute` by a non-admin → `not_allowed`; each of the four outcomes on a fresh ₦50,000 hire gives the same ledger amounts as `settle_engagement` gives in `settlement.test.sql`, sets the dispute `decided` with `outcome` and `decision_reason`, and a second decide → `dispute_closed` with no new ledger rows.
  - business `accept_submission` on a disputed hire whose last submission was denied → releases, dispute `decided` with `outcome = 'accepted_by_business'`, `closed_by` = the business.
  - Stage 6 `settle_engagement` on a `disputed` hire → `engagement_locked` (Review Focus 5).
  - RLS: only the two people and admins can select disputes and statements.

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3:** migration per spec §4, §5 and constraints above. `accept_submission` on `disputed`: allowed only for the business; closes the open dispute (`accepted_by_business`) in the same transaction, marks the latest submission `accepted`, settles with release. `decide_dispute` settles with release_status `accepted` and records the outcome. Split amounts: whole naira, validated by `settle_engagement_internal` already.

- [ ] **Step 4:** `supabase migration up && supabase test db` → pass. Codes into `refusals.ts`; `npm run db:types && npm run typecheck && npm test`.

- [ ] **Step 5: Commit** `Add disputes that an admin decides`.

### Task 4: Stage 7 notifications

**Files:**
- Create: `supabase/migrations/20261117100300_stage7_notifications.sql`
- Modify: `supabase/tests/money_notifications.test.sql` (new assertions; bump `plan(n)`)
- Modify: `src/lib/notifications.ts`, `src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: kinds from Task 2's enum migration; tables from Tasks 1 and 3.
- Produces: triggers on `submissions` (insert → `work_submitted` to business; update to `denied` → `submission_denied` to creator with `reasons`, `rounds_left`), `disputes` (insert → `dispute_opened` to the other person; update to `withdrawn` → `dispute_withdrawn` to the other person), `dispute_statements` (insert → `dispute_statement` to whichever of the two people isn't the author; admins' statements go to both). `engagements_money_notify` recreated: for a settlement, read `actor_user_id` from the hire's `hire_settled` ledger row and skip notifying that person; add `'status', new.status` to the facts so `auto_released` reads differently.

- [ ] **Step 1: Tests.** pgTAP: the business gets no `engagement_settled` for its own accept, the creator gets one; auto-release notifies both with `data->>'status' = 'auto_released'`; each new kind lands on the right person and never on the actor. Unit (`notifications.test.ts`): `describeNotification` returns a title and link for every new kind and for `engagement_settled` with `status: 'auto_released'` ("released automatically"); links go to `/jobs/<id>` for creators, `/business/engagements/<id>` for businesses, the role's dispute page for dispute kinds.

- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `supabase migration up && supabase test db && npm test` → pass.

- [ ] **Step 5: Commit** `Notify both sides about submissions and disputes`.

### Task 5: Race checks

**Files:**
- Modify: `scripts/money-race.mjs` (+ helpers in `scripts/money-race-lib.mjs` if needed)

**Interfaces:**
- Consumes: Tasks 1–3 functions.

- [ ] **Step 1:** add scenarios using the existing `race()` helper, each asserting exactly one settlement group and `invariants()` clean:
  - `accept_submission` vs `release_overdue_submissions()` on an overdue hire;
  - `deny_submission` vs `release_overdue_submissions()` on an overdue hire (outcome: auto-released, no denial stored);
  - `decide_dispute` vs `accept_submission` on a disputed hire;
  - two `submit_work` calls on one `in_progress` hire (one round created);
  - `withdraw_from_engagement` vs `accept_submission` on a `submitted` hire (withdraw refused).
- [ ] **Step 2:** `node scripts/money-race.mjs` → all PASS.
- [ ] **Step 3: Commit** `Race Stage 7 settlement paths`.

### Task 6: Server boundary: proof processing, storage, db functions, actions plumbing

**Files:**
- Create: `src/lib/proof.ts`, `src/lib/proof.test.ts` (pure validation)
- Create: `src/lib/proof-image.ts` (sharp processing; mirror `profile-photo.ts`)
- Modify: `src/lib/storage.ts` (proof functions)
- Create/extend: `src/lib/db/submissions.ts`, `src/lib/db/disputes.ts`
- Modify: `src/lib/db/applications.ts` (`engagement_details` gains `review` facts) and a migration `20261117100400_engagement_details_review.sql` if the JSON needs new fields
- Modify: `src/app/api/cron/review-deadlines/route.ts` (wire orphan deletion)
- Modify: `docs/PROVIDERS.md`

**Interfaces:**
- Produces (TS):
  - `parseProofLinks(raw: string): { ok: true; links: string[] } | { ok: false; message: string }` (one per line, trims, de-dupes, rules from Global Constraints)
  - `parseDenialReasons(raw: string[]): ...` same shape
  - `processProofImage(file: File): Promise<{ ok: true; webp: Buffer } | { ok: false; message: string }>`
  - `saveProofFile(ownerId: string, webp: Buffer): Promise<string>` (returns proof file id; uploads to `work-proof/<ownerId>/<uuid>.webp` then calls `register_proof_file` as service role), `proofFileUrls(paths: string[]): Promise<Map<string, string>>` (signed, 10 minutes), `deleteProofObjects(paths: string[]): Promise<void>`
  - `submitWork(engagementId, note, links, fileIds)`, `acceptSubmission(engagementId)`, `denySubmission(engagementId, reasons)`, `withdrawFromEngagement(engagementId)`, `listSubmissions(engagementId): Promise<SubmissionView[]>`
  - `openDispute(...)`, `addDisputeStatement(...)`, `withdrawDispute(disputeId)`, `decideDispute(disputeId, outcome, releaseKobo, reason)`, `getDispute(disputeId): Promise<DisputeView | null>`, `listOpenDisputes(): Promise<DisputeListRow[]>` (admin)
  - All writers return `{ ok: true, ... } | Refused` via `refused()` in `src/lib/db/refusal.ts`.
  - `SubmissionView = { id, round, status, note, links: string[], files: { url: string }[], createdAt, reviewDeadlineAt, decidedAt, denialReasons: string[] }`; `DisputeView = { id, engagementId, status, openedBy, openedFrom, reason, openedAt, closedAt, outcome, decisionReason, statements: { id, authorId, authorName, authorRole, body, links, files, createdAt }[] }`.

- [ ] **Step 1:** `proof.test.ts`: 0 links + 0 files refused with "Add a link or a screenshot"; 11 links refused; `javascript:` and `ftp://` refused; a 501-char link refused; duplicates collapsed; blank lines ignored; reasons: empty list, 2-char reason and 6 reasons refused, 5 valid accepted. Run → FAIL; implement; → PASS.
- [ ] **Step 2:** implement `proof-image.ts` reusing the content sniffing from `profile-photo.ts` (don't duplicate it: extract the sniff into a shared function in `profile-photo.ts` only if it's a straight move); longest side 2,000 px, `rotate()` before strip, WebP quality 80.
- [ ] **Step 3:** storage and db functions per Interfaces; wire `deleteProofObjects` into the cron route (delete storage objects, then nothing else: the rows were already removed by `delete_orphan_proof_files()`).
- [ ] **Step 4:** add the `work-proof` bucket and `/api/cron/review-deadlines` to `docs/PROVIDERS.md` (storage and scheduled-jobs tables).
- [ ] **Step 5:** `npm run lint && npm run typecheck && npm test` → pass. **Commit** `Add proof uploads and the Stage 7 data functions`.

### Task 7: Status words and boards

**Files:**
- Modify: `src/lib/job-status-words.ts`, `src/lib/hire-status-words.ts`, `src/lib/board.ts` and their `.test.ts`

**Interfaces:**
- Consumes: `EngagementSummary` plus review facts `{ round: number | null; reviewDeadlineAt: string | null; roundsLeft: number; disputeId: string | null }` (added to `JobFacts`/`HireFacts`).
- Produces: `JobStatusWords` gains `canSubmit`, `canResubmit`, `canWithdraw` (now true for `in_progress`/`denied` too), `canOpenDispute`; `HireStatusWords` gains `canReview`, `canOpenDispute`. Board columns:
  - business: `in_progress` stays; add `{ key: "to_review", label: "To review", hint: "Work submitted" }`, `{ key: "changes", label: "Changes asked", hint: "Waiting for the creator" }`, `{ key: "disputed", label: "In dispute", hint: "With Pitchype" }` between `in_progress` and `completed`.
  - creator: add the same three keys with hints "Waiting for the business", "Fix and resubmit", "With Pitchype".

- [ ] **Step 1: Tests** for every status: `submitted` before the deadline → "Waiting for [business] to review" with the date; `submitted` after the deadline → "Review time ended on [date]. The money is being released."; `denied` with rounds left → canResubmit, words include "N resubmissions left"; `denied` with 0 left → canResubmit false, canOpenDispute true; `disputed` → "Pitchype is reviewing this"; `auto_released` → "Released automatically"; business `in_progress` before/after the non-delivery date → canOpenDispute false/true. Board: each new status maps to its column; `accepted`/`auto_released` still `completed`/`paid`.
- [ ] **Step 2:** run → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** `Word and board the Stage 7 statuses`.

### Task 8: Creator job page

**Files:**
- Modify: `src/app/(portal)/(influencer)/jobs/[id]/page.tsx`, `actions.ts`, `withdraw-form.tsx`
- Create: `src/app/(portal)/(influencer)/jobs/[id]/submit-form.tsx`, `rounds.tsx` (history of rounds, shared with the business page: put it in `src/components/engagement/rounds.tsx` since Tasks 9 and 10 use it too)

**Interfaces:**
- Consumes: Task 6 db functions, Task 7 words.
- Produces: `submitWorkAction(prev, form)`, `withdrawAfterStartAction` merged into existing `withdrawAction` (it picks `withdraw_from_engagement` when the job is `in_progress`/`denied`, `cancel_funded_engagement` when `funded`), `openDisputeAction` (creator side; shared action file pattern).

- [ ] **Step 1:** submit form: deliverables checklist (read-only, from the campaign), links textarea (one per line), up to 5 screenshot inputs (client-side downscale as in the profile photo form), note. Action order: `requireRole("influencer")` → validate (`parseProofLinks`) → rate limit (new `isSubmitLimited`: 10 per hour per user in `src/lib/money-limits.ts`) → process + save files → `submitWork`. On refusal after files were saved, leave them for the orphan sweep.
- [ ] **Step 2:** rounds history with denial reasons and screenshot thumbnails (signed URLs); Resubmit when `canResubmit`; Open a dispute (reason textarea, optional proof) when `canOpenDispute`; withdraw confirmation text: "The business gets its money back and you won't be paid for this job."
- [ ] **Step 3:** skeleton in the page's `loading.tsx` updated for the new panels.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test`; run the dev server's page in the browser as a creator (see Task 11). **Commit** `Let creators submit work, resubmit and dispute`.

### Task 9: Business hire page

**Files:**
- Modify: `src/app/(portal)/(business)/business/engagements/[id]/page.tsx`, `actions.ts`
- Create: `.../engagements/[id]/review-form.tsx`

**Interfaces:**
- Consumes: Task 6, Task 7, `src/components/engagement/rounds.tsx`.
- Produces: `acceptSubmissionAction`, `denySubmissionAction`, `openDisputeAction` (business side).

- [ ] **Step 1:** review panel: latest submission, "Review by [date], or it's released automatically", Accept with confirm "₦X goes to [creator]" (X = agreed price; the creator's fee is theirs, not shown as the business's cost), Deny with 1–5 reason fields. Results: `'auto_released'` / `'review_closed'` show "Your review time ended, so the payment was released automatically."
- [ ] **Step 2:** Open a dispute on `denied` or past the non-delivery date (`canOpenDispute`), copy says the admin decides and both sides can add statements.
- [ ] **Step 3:** skeleton updated; `npm run lint && npm run typecheck && npm test`. **Commit** `Let businesses review work and open disputes`.

### Task 10: Dispute pages and admin disputes

**Files:**
- Create: `src/app/(portal)/(influencer)/jobs/[id]/dispute/page.tsx`, `src/app/(portal)/(business)/business/engagements/[id]/dispute/page.tsx` (both render `src/components/engagement/dispute-thread.tsx`)
- Create: `src/app/(portal)/(admin)/admin/disputes/page.tsx`, `.../admin/disputes/[id]/page.tsx`, `.../admin/disputes/actions.ts`, `decide-form.tsx`, `loading.tsx` for each new page
- Modify: the admin sidebar group (find where `/admin/money` is linked) to add "Disputes" with the open count.

**Interfaces:**
- Consumes: `getDispute`, `addDisputeStatement`, `withdrawDispute`, `listOpenDisputes`, `decideDispute`; `settlePreview()` from `src/lib/settle-preview.ts` for the decide screen.

- [ ] **Step 1:** thread component: the reason, the hire terms (current campaign brief, deliverables, agreed price, from `getEngagementDetails` + campaign), the rounds history, statements in order with author role labels, add-statement form (contact-details check on body via `findContactDetails`, refused with "Keep contact details out of disputes."), Withdraw for the opener. Expectations text: "The other side is asked to respond within 3 days. Pitchype aims to decide within 5 working days."
- [ ] **Step 2:** admin list (oldest first, days open, hire price, who opened, from which status); admin page = thread + decide form showing the guidance from spec §4 and `settlePreview()` output before confirm; reason required.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test`. **Commit** `Add dispute pages and the admin decision`.

### Task 11: Docs and end-to-end verification

**Files:**
- Modify: `CLAUDE.md` (§5 Submission built; §6.6 settlement statuses and who calls `settle_engagement_internal`; §8 new kinds; §12 close item 3 with the spec's decisions), `docs/TODO.md` (tick lines 236, 359, 364, 505; add: email for Stage 7 notices in Stage 8, hire terms snapshot, campaign → `completed`), `docs/legal/terms.md` §6.3 and §7.4 (fill in 3 resubmissions and the 3-day / 5-working-day expectations).

- [ ] **Step 1:** update the docs above.
- [ ] **Step 2:** full checks: `npm run lint && npm run typecheck && npm test && supabase test db && node scripts/money-race.mjs`. Replay all migrations from scratch in a rolled-back transaction (not `supabase db reset`) to prove they apply cleanly.
- [ ] **Step 3:** browser run on `next start -p 3100` built against local Supabase (memory: override the env on the command line; never the live project), at 390 px and desktop: creator submits with a link and a screenshot → business denies → creator resubmits → business accepts (wallet shows net); a second hire: submit → set `review_deadline_at` back in local SQL → call the cron route with `CRON_SECRET` → `auto_released`; a third: deny → creator opens a dispute → statements both sides → admin decides a split. Check notifications on each side. Delete the test users afterwards.
- [ ] **Step 4: Commit** `Document Stage 7` and report what was and wasn't verified.
