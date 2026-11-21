# Campaign Checkpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every campaign a visible timeline (start, final delivery cutoff, end) with a progress bar, and add optional fixed checkpoints, a kickoff confirmation, final-submission requirements, overdue tracking with warnings, and an early non-delivery dispute — without any checkpoint state moving money or touching auto-release.

**Architecture:** Campaign-level schedule rows generated when a campaign leaves draft; per-hire checkpoint rows created by `start_engagement()`; evidence through the existing proof-file pipeline; the final gate inside `submit_work()`; notices from the existing daily review-deadlines job; the early dispute inside `non_delivery_dispute_at()`. Pure timing and validation rules live in `src/lib/checkpoints.ts`, mirrored in SQL.

**Tech Stack:** Next.js App Router + TypeScript, Supabase Postgres (plpgsql, pgTAP), `node --test`, CSS-only progress bars.

**Spec:** `docs/superpowers/specs/2026-11-22-campaign-checkpoints-design.md` — read it fully first and keep it open; § references below point into it.

## Global Constraints

- Read `CLAUDE.md` fully first (§2, §4a, §5, §6, §7, §8, §9 bind every task). Branch `pre-merge-updates`; one commit per task with an accurate `Co-Authored-By:` trailer for the model you are. Do not push or merge.
- New migrations only: `supabase/migrations/20261125HHMMSS_<what>.sql` in task order. `create or replace` from the **latest** definition — latest files today: `campaigns_before_write` → `20261121100000_click_window_lock.sql`; `transition_campaign` → `20261123100100_identity_gates.sql`; `start_engagement` → `20261119100100_tracked_links.sql`; `submit_work`, `register_proof_file` → `20261117100000_create_submissions.sql`; `non_delivery_dispute_at` → `20261117100200_create_disputes.sql`; `open_dispute` → `20261120100200_click_hire_actions.sql`; `delete_orphan_proof_files` → `20261120100300_click_proofs.sql`; `save_campaign_draft` → `20261119100000_per_click_campaigns.sql`. Re-check with `grep -n "function public.<name>(" supabase/migrations/*.sql` before editing.
- Apply with `supabase migration up` — **never `supabase db reset`**; then `npm run db:types`. Verify every task with `supabase test db` (four known local failures: `funding.test.sql` 1, 92, 93; `settlement.test.sql` 114 — leave them), `npm test`, `npm run lint`, `npm run typecheck`.
- `.env.production.local` is the LIVE database: build only with local overrides (or in a scratch copy without that file); never touch the live database; never stop processes you didn't start (dev server on 3030). No new npm dependencies.
- **Money invariant:** no checkpoint function writes `ledger_entries`, changes `engagements.status`, `review_deadline_at`, escrow or wallets. The only touch points with existing money/workflow code are: the gate in `submit_work()` (refusing, never settling), and the earlier date in `non_delivery_dispute_at()`.
- **Campaigns with checkpoints off and no final requirements behave exactly as today** (except the timeline display and the timeline-required check for new campaigns). Existing pgTAP assertions must not change; add fixture data only. If one must change, stop and report.
- Dates: Lagos calendar dates; a due date's instant is `timezone('Africa/Lagos', (due_on + 1)::timestamp)` (end of that day, Lagos). TS uses the same rule (`lagosDate`).
- UI: design-system components and tokens only; skeletons for new Suspense boundaries; CSS-only bars; check at 390px; copy never threatens money ("No money is held back because of a missed checkpoint").
- Stop and report on any conflict between the spec and the code.

## Review Focus

1. **A creator starting 2 days before a checkpoint, or on the checkpoint day, or after it** → that checkpoint is skipped with the right reason, the next one applies. Test: Task 1 node + Task 3 pgTAP.
2. **A Lagos-midnight boundary** (start at 23:30 WAT = 22:30 UTC) → the start date is the Lagos date. Test: Task 1 node.
3. **Late evidence submitted after the business could open the early dispute** → the early date goes back to today's rule; a dispute already opened stays open. Test: Task 5 pgTAP + Task 8 race.
4. **The daily job run twice, or a day late** → no duplicate notices; the warning always precedes "dispute available" by ≥ 24 h. Test: Task 5 pgTAP.
5. **A checkpoint campaign's final submission** → refused while a past-due row lacks evidence, accepted with all done/done_late, and once accepted the 7-day countdown is set exactly as today; nothing in the ledger changes. Test: Task 4 pgTAP.

---

### Task 1: Timing and validation rules (pure TS)

**Files:**
- Create: `src/lib/checkpoints.ts`, `src/lib/checkpoints.test.ts`

**Interfaces:**
- Produces:
  - `type EvidenceType = "progress_update" | "content_links" | "publication_screenshots" | "analytics"`; `type FinalRequirement = "content_links" | "publication_screenshots" | "analytics" | "final_report"`; `type Metrics = { platform: string; views?: number; reach?: number; impressions?: number; likes?: number; comments?: number; shares?: number; saves?: number; linkClicks?: number }[]`.
  - `isValidInterval(days: number): boolean` — integer 2–30 (3, 7, 14 are the presets).
  - `checkpointDates(input: { postFrom: string; deliverBy: string; intervalDays: number }): string[]` — `postFrom + k × interval` (k ≥ 1) strictly before `deliverBy`, ISO `YYYY-MM-DD`.
  - `lagosDate(instant: Date): string`.
  - `checkpointApplies(dueOn: string, startedAt: Date): "applies" | "started_after" | "too_soon"` — applies iff `dueOn ≥ lagosDate(startedAt) + 3 days`; `started_after` if `dueOn < lagosDate(startedAt)`; else `too_soon`.
  - `kickoffDueAt(startedAt: Date): Date` — + 48 hours.
  - `timelineView(input: { start: string | null; liveFrom: string; deliverBy: string; endsOn: string | null; checkpoints: string[]; today: string }): { from: string; to: string; todayPercent: number; markers: { kind: "cutoff" | "checkpoint"; date: string; percent: number }[] }` — `from = start ?? liveFrom`, `to = endsOn ?? deliverBy`, percents clamped 0–100.
  - `parseMetrics(value: unknown): { ok: true; metrics: Metrics } | { ok: false; error: string }` — 1–6 platform entries, each value a non-negative safe integer.
  - `evidenceProblems(required: EvidenceType[], e: { note: string | null; links: string[]; fileCount: number; metrics: Metrics | null; capturedOn: string | null }): string[]` (spec §5.4 rules; empty = OK).
  - `finalRequirementProblems(required: FinalRequirement[], s: { links: string[]; fileCount: number; metrics: Metrics | null; capturedOn: string | null; report: string | null; postFrom: string | null; today: string }): string[]` (spec §5.5 and §5.1: `captured_on` not before `postFrom`, not after `today`; `final_report` 100–1,000 chars).

- [x] **Step 1: Failing tests:** `checkpointDates({postFrom:"2026-12-01", deliverBy:"2026-12-20", intervalDays:7})` → `["2026-12-08","2026-12-15"]`; interval that fits none → `[]`; a date equal to `deliverBy` is excluded. `checkpointApplies("2026-12-08", <start 2026-12-05T09:00+01:00>)` → applies; start 12-06 → too_soon; start 12-09 → started_after; start `2026-12-04T23:30+01:00` uses Lagos date 12-04 (Review Focus 1–2). `kickoffDueAt` +48h. `timelineView` percents and clamping (before start → 0, after end → 100). `parseMetrics` accepts `[{platform:"instagram",views:1200,likes:40}]`, rejects negatives, floats, strings, 7 entries. `evidenceProblems` and `finalRequirementProblems` one case per type plus the empty-requirements case.
- [x] **Step 2–4:** fail → implement → pass; typecheck, lint.
- [x] **Step 5: Commit** `Add checkpoint timing and evidence rules`.

### Task 2: Timeline and checkpoint configuration on campaigns (SQL)

**Files:**
- Create: `supabase/migrations/20261125100000_campaign_timeline.sql`, `supabase/tests/campaign_timeline.test.sql`
- Modify: `src/lib/db/campaigns.ts`, `src/lib/campaign.ts` (+ test), `src/types/database.ts`

**Interfaces:**
- Produces (SQL): `campaigns` columns `ends_on date`, `checkpoints_enabled boolean not null default false`, `checkpoint_interval_days integer` (check 2–30, required when enabled), `checkpoint_evidence text[]` (subset of the four `EvidenceType` values, non-empty when enabled), `final_requirements text[] not null default '{}'` (subset of `FinalRequirement`; must be empty for `payment_model = 'per_click'`); checks `ends_on is null or ends_on >= deliver_by`. Table `campaign_checkpoints (id, campaign_id, seq, due_on date, unique (campaign_id, seq))`, RLS: readable by whoever can read the campaign (reuse the campaign visibility predicate), no client writes. `generate_campaign_checkpoints(campaign uuid)` (internal; deletes and regenerates while the campaign has no hires; used on every draft → pending_review/open). `transition_campaign()` additions on leaving draft: `timeline_required` (no `post_from` or `ends_on`), `timeline_in_past` (`post_from` before today Lagos — also when an admin approves a first campaign), `checkpoints_do_not_fit` (enabled but zero dates). `campaigns_before_write()`: the new config columns locked once submitted (like deliverables); `ends_on` may only move later. `save_campaign_draft(...)` gains the new fields (keep the existing call shape working via defaults).
- Produces (TS): campaign draft types/validation in `src/lib/campaign.ts` include `endsOn`, `checkpointsEnabled`, `checkpointIntervalDays`, `checkpointEvidence`, `finalRequirements` (server-side validation mirrors the SQL; per-click → `finalRequirements` must be empty); `src/lib/db/campaigns.ts` reads/writes them and lists `campaign_checkpoints` for a campaign (`listCampaignCheckpoints(campaignId): Promise<{ seq: number; dueOn: string }[]>`).

- [x] **Step 1: Failing pgTAP:** submit without `ends_on` → `timeline_required`; past `post_from` → `timeline_in_past`; enabled with no room → `checkpoints_do_not_fit`; 7-day example generates exactly 12-08 and 12-15; resubmitting after send-back regenerates; config locked after submit; `ends_on` can move later only; per-click with final requirements refused; an existing live campaign with null `ends_on` is untouched by the migration; checkpoints off → no schedule rows.
- [x] **Step 2–4:** fail → migration → `supabase migration up` → green (bar the four known) → types → TS → `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Give campaigns a timeline and an optional checkpoint schedule`.

### Task 3: Per-hire checkpoints, kickoff and evidence (SQL)

**Files:**
- Create: `supabase/migrations/20261125100100_hire_checkpoints.sql`, `supabase/tests/hire_checkpoints.test.sql`
- Create: `src/lib/db/checkpoints.ts`; Modify: `src/types/database.ts`, `src/lib/refusals.ts` (+ test)

**Interfaces:**
- Produces (SQL), spec §5.3–5.4, §5.7: tables `hire_checkpoints`, `checkpoint_evidence` (append-only), `checkpoint_events` (append-only, trigger rejects update/delete/truncate, `enable always`); `proof_files.checkpoint_evidence_id uuid` with the one-parent check widened to "at most one of submission / dispute statement / click proof / checkpoint evidence" (read the current constraint first); orphan cleanup covers it. `start_engagement()` creates the kickoff row (`due_at = started_at + 2 days`) and one row per schedule date (`due` or `skipped` with `skip_reason`), plus `applied`/`skipped` events, only when `checkpoints_enabled`. `submit_kickoff(engagement uuid, confirmed_brief boolean, confirmed_started boolean, note text, file_ids uuid[]) returns uuid` and `submit_checkpoint(hire_checkpoint uuid, note text, links text[], metrics jsonb, captured_on date, period_from date, period_to date, file_ids uuid[]) returns uuid` (authenticated; the hire's creator only; hire `in_progress`, `submitted`, `denied` or `disputed`; validates the campaign's evidence rules and the metrics shape in SQL; contact details refused with the dispute-statement rule; sets `done` before `due_at`, `done_late` after; writes `kickoff_submitted` / `evidence_submitted` / `evidence_late` events; notifications `kickoff_done`, `checkpoint_done` or `checkpoint_late` to the business). RLS: the hire's creator and business select all three tables for their hire; admins all; no client writes.
- Produces (TS `src/lib/db/checkpoints.ts`): `listHireCheckpoints(engagementId): Promise<HireCheckpoint[]>`, `listCheckpointEvents(engagementId)`, `submitKickoff(...)`, `submitCheckpoint(...)` (same `{ ok, reason }` shape as other wrappers). New refusal codes: `kickoff_confirmations_required`, `checkpoint_evidence_missing`, `checkpoint_not_yours`, `checkpoint_closed`, `hire_not_running`.

- [x] **Step 1: Failing pgTAP:** on the 7-day example (checkpoints 12-08 and 12-15), a hire started 12-05 gets a kickoff row plus 12-08 and 12-15 `due`; started 12-06 → 12-08 `skipped too_soon`, 12-15 `due`; started 12-09 → 12-08 `skipped started_after`, 12-15 `due` (the same cases as Task 1); checkpoints off → no rows; kickoff needs both confirmations; evidence rules enforced per type; on-time → `done`, after due → `done_late`; another creator / the business can't submit; evidence after settlement refused; RLS per role; events append-only; **no `ledger_entries` row and no `engagements` column change from any of these functions** (compare before/after).
- [x] **Step 2–4:** fail → migration → green → types → wrappers → refusal words → `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Track checkpoints and evidence for each hire`.

### Task 4: Final-submission eligibility (SQL)

**Files:**
- Create: `supabase/migrations/20261125100200_final_submission_rules.sql`, `supabase/tests/final_submission_rules.test.sql`
- Modify: `src/lib/db/submissions.ts` (wrapper for the new overload), `src/types/database.ts`, `src/lib/refusals.ts`

**Interfaces:**
- Produces: `submit_work(engagement uuid, note text, links text[], file_ids uuid[], metrics jsonb, captured_on date, report text) returns uuid` (new overload; the 4-arg one calls it with nulls and keeps its grants). Before today's logic: `checkpoints_outstanding` while any of the hire's rows is `due`/`overdue` with `due_at <= now()`; `final_requirements_missing` unless the campaign's `final_requirements` are met (spec §5.5, also on resubmission). On success, rows still `due` with `due_at > now()` → `closed` (`final_submitted`) with events. Everything after is the existing body unchanged. `submissions` gains nullable `metrics jsonb`, `captured_on date`, `report text`.

- [x] **Step 1: Failing pgTAP** (Review Focus 5): refused with an overdue unevidenced row (and with a missed kickoff); allowed with all `done`/`done_late`; a future row doesn't block and is `closed` after; `review_deadline_at` = now + 7 days and engagement `submitted` exactly as the existing tests expect; `ledger_entries` unchanged by the submit; each final requirement enforced, including on a resubmission after denial; the 4-arg call on a campaign without requirements behaves exactly as before (re-run the key assertions of `submissions.test.sql`'s happy path in this file).
- [x] **Step 2–4:** fail → migration → green → wrapper → `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Require checkpoints and final requirements before a final submission`.

### Task 5: Overdue notices, warnings and the early dispute (SQL + job)

**Files:**
- Create: `supabase/migrations/20261125100300_checkpoint_notices.sql`, `supabase/tests/checkpoint_notices.test.sql`
- Modify: `src/lib/review-deadlines.ts` (+ test), `src/lib/db/submissions.ts` or `src/lib/db/checkpoints.ts` (wrapper), `src/lib/notifications.ts` (+ test), `src/lib/notification-email.ts` (+ test)

**Interfaces:**
- Produces: notification kinds `checkpoint_reminder`, `checkpoint_overdue`, `checkpoint_warning`, `checkpoint_dispute_available`, `checkpoint_done`, `checkpoint_late`, `kickoff_done` (enum values added here if Task 3 didn't need them yet; Task 3 may add the three it sends). `run_checkpoint_notices() returns jsonb` (service role; counts per notice) implementing spec §5.6 for hires still `in_progress`/`submitted`/`denied`/`disputed`, each notice once (guarded by its `checkpoint_events` row), the warning only for fixed-price hires, "dispute available" only for fixed-price `in_progress` hires whose row is still overdue, was warned ≥ 24 h earlier and is > 3 days overdue; ended hires skipped. `non_delivery_dispute_at(e)` per spec §5.6 (least of today's rule and the earliest still-overdue row's `greatest(due_at + 3 days, warned_at + 24 hours)`; rows never warned don't count; fixed-price, checkpoint campaigns only). `runReviewDeadlines` calls the wrapper as one more step (its own try/catch, counted in the result, 500 on failure like the other steps). Words for every new kind (to the right person, href to the hire page); `EMAIL_POLICY`: reminder, overdue, warning, dispute_available → `always`; done, late, kickoff_done → `applications`.

- [x] **Step 1: Failing pgTAP** (Review Focus 3–4): with `now()` controlled by fixture timestamps: reminder within 24 h of due; overdue after due (both parties); warning at ≥ 2 days; dispute available only after warning + 24 h and > 3 days; running twice adds nothing; a run 5 days late sends overdue+warning but not dispute-available in the same run; per-click hire gets reminder/overdue only; `open_dispute` by the business succeeds at the early date and is refused just before it; late evidence → `non_delivery_dispute_at` back to today's rule; campaigns without checkpoints → `non_delivery_dispute_at` unchanged (assert equality with the old formula).
- [x] **Step 2–4:** fail → migration → green → job step, words, policy → `npm test`, typecheck, lint.
- [x] **Step 5: Commit** `Warn about missed checkpoints and allow an early non-delivery dispute`.

### Task 6: Campaign builder

**Files:**
- Modify: `src/app/(portal)/(business)/business/campaigns/campaign-form.tsx` (and its step components), `…/campaigns/actions.ts`, `…/campaigns/new/page.tsx` as needed

**Interfaces:**
- Consumes: Task 1 (`checkpointDates`, `isValidInterval`), Task 2 fields.
- Produces: in the existing four-step builder, a **Timeline** group (start = `post_from`, final delivery = `deliver_by`, end = `ends_on`, with one-line explanations) and a **Checkpoints** group (switch; frequency radio 3 / 7 / 14 / Custom with a 2–30 number; evidence checkboxes; a live list of the generated dates via `checkpointDates`; an empty-list warning matching `checkpoints_do_not_fit`), plus **Final requirements** checkboxes (hidden for per-click). Server action validates with the Task 2 TS rules and surfaces the SQL refusals as words. Locked fields show as read-only once submitted, like deliverables.

- [ ] **Step 1:** tests for any new pure form helper (e.g. parsing the frequency radio + custom value).
- [ ] **Step 2–4:** implement; `npm test`, typecheck, lint; reason through 390px.
- [ ] **Step 5: Commit** `Set the timeline, checkpoints and final requirements in the campaign builder`.

### Task 7: Timeline, checklist and trail on campaign and hire pages

**Files:**
- Create: `src/components/campaigns/campaign-timeline.tsx` (progress bar), `src/components/checkpoints/checkpoint-list.tsx`, `src/components/checkpoints/kickoff-form.tsx`, `src/components/checkpoints/checkpoint-form.tsx`, `src/components/checkpoints/checkpoint-trail.tsx`, server actions co-located with the creator hire page
- Modify: `src/app/(portal)/(business)/business/campaigns/[id]/page.tsx`, `src/app/(portal)/(influencer)/campaigns/[id]/page.tsx`, `src/components/campaigns/campaign-facts.tsx`, `src/app/(portal)/(influencer)/jobs/[id]/page.tsx` and `submit-form.tsx`, `src/app/(portal)/(business)/business/engagements/[id]/page.tsx`, the admin dispute page and `/admin/money/engagements/[id]` (trail)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: spec §5.1 display + `timelineView` bar (CSS only, labelled dates, markers; readable with motion off) on both campaign pages and both hire pages; spec §5.8 checklist with status chips (Due / Overdue / Done / Done late / Skipped "started after this date" / Closed "final work submitted"), the kickoff and checkpoint forms (screenshots through the existing proof upload pipeline, metrics fields per platform with "Reported by you" / "Reported by the creator" labels), the final-submission form showing outstanding items and final requirements (and the new metrics/captured-on/report fields when required), the trail timeline on hire, dispute and money-trail pages, and the business's dispute button reflecting the earlier date. Copy states that no money is held back for a missed checkpoint.

- [ ] **Step 1:** tests for pure view helpers you add (e.g. `checkpointChip(row, now)`).
- [ ] **Step 2–4:** implement; skeletons; `npm test`, typecheck, lint; local build with overrides; reason through 390px.
- [ ] **Step 5: Commit** `Show campaign timelines, checkpoints and their trail to both sides`.

### Task 8: Races, docs and final verification

**Files:**
- Modify: `scripts/money-race.mjs`, `scripts/money-race-lib.mjs`, `CLAUDE.md` (§5 campaign fields, checkpoint states and the early-dispute rule; §8 new kinds; §12 decisions of 2026-11-22), `docs/campaign-spec-decisions.md` (timeline + checkpoints section), `docs/TODO.md`

**Interfaces:**
- Produces race scenarios numbered after the last existing one: `checkpoint evidence vs daily job marking overdue`, `late evidence vs business opening the early dispute` (one wins cleanly; no half state), `final submission vs daily job`. Each asserts the existing invariants (ledger unchanged by checkpoint paths).

- [ ] **Step 1:** add the scenarios; `node scripts/money-race.mjs` → all PASS.
- [ ] **Step 2:** docs in CLAUDE.md's voice.
- [ ] **Step 3:** full verification: lint, typecheck, `npm test`, `supabase test db` (only the four known local failures), a from-scratch migration replay in a throwaway database with every pgTAP file green (drop it afterwards), the race script, a local build with overrides.
- [ ] **Step 4: Commit** `Document campaign checkpoints`.
- [ ] **Step 5:** final report: commits, every command and its result, what you couldn't verify (browser), deviations and why, open questions.
