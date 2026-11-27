# Campaign timelines, checkpoints and final-submission requirements — design

Date: 2026-11-22. Status: drafted from the owner's written rules (two pasted briefs, 2026-11-22) and
conversation; builder check done; awaiting the owner's approval. Branch: `pre-merge-updates` (stacked on `identity-verification`
→ `cray-payments`; nothing is merged until the owner has set up keys and sandboxes).

---

## 1. Why

Creators can claim to have started, do nothing for weeks, then post in the last days and submit to
start the 7-day auto-release. Businesses have no view of progress and no recourse until the
deliver-by date has passed. The owner wants campaign timelines everyone can see, optional fixed
**checkpoints** with evidence, a **kickoff** confirmation, and **final-submission requirements**,
while keeping the creator's protections ("auto-release is real", CLAUDE.md §1) and never taking money
for a missed checkpoint.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every campaign shows a **start date, a final delivery cutoff and an end date**, with a progress
  bar, on the business campaign page and the creator-facing campaign page.
- **Optional checkpoints** (off by default): the business picks a frequency (every 3, 7 or 14 days,
  or a custom interval) and the evidence each checkpoint needs. Dates are fixed for the whole
  campaign.
- **Kickoff confirmation** for every hire on a checkpoint campaign: due 2 days after "Start work".
- **Per-creator applicability** from their actual start date; skipped checkpoints recorded.
- **Late evidence always accepted**, recorded as late.
- **No evidence more than a day early** (changed 2026-11-27): a progress checkpoint opens at the
  start of the day before its due day, Lagos time (`checkpoint_not_open`, migration
  `20261201100000`). The kickoff is open from "Start work".
- **Final-submission requirements** the business chooses (content links, publication screenshots,
  analytics with metrics and capture date, a written final report); the final submission is
  eligible only when every applicable checkpoint has evidence and the requirements are met; then the
  existing 7-day countdown starts as today.
- **Escalation (owner, 2026-11-22):** creators are reminded and warned first; once a checkpoint
  (or the kickoff) is **more than 3 days overdue** and still without evidence, the business may open
  the existing non-delivery dispute early.
- Audit trail and notifications for every checkpoint event, visible to both sides and admins.

**Non-goals**
- Business approval/denial of checkpoint evidence (evidence only; concerns go to chat or a dispute —
  my call, to keep checkpoints out of the payment rules as the owner asked).
- Automatic analytics from platform APIs; analytics as a payment condition.
- Rolling per-creator schedules; checkpoints on draft edits after go-live; system chat messages.
- Changing per-click settlement.

**Anti-goals**
- Any checkpoint state moving money, refunding, freezing escrow, or removing auto-release.
- A creator permanently blocked from catching up.
- A second, disconnected submission/proof/notification system.
- Changing anything for campaigns with checkpoints off (beyond showing dates and the progress bar).

## 3. Constraints

- CLAUDE.md §2 (simplicity), §5 (transitions validated server-side in one place; edit locks), §6
  (money rules), §7 (RLS, server validation), §8 (notifications from one table), §9 (migrations).
- Dates are Lagos calendar dates; "due" means **the end of that day, Lagos time** (as `deliver_by`
  already does). Stored as `date`; the due instant is computed as
  `timezone('Africa/Lagos', (due_on + 1)::timestamp)`.
- Reuse: `post_from`, `deliver_by`, the campaign builder, `submit_work()`/`submissions`, the proof
  file pipeline (`proof_files`, `register_proof_file()`, the private `work-proof` bucket,
  `src/lib/proof-image.ts`), `notify()` + `src/lib/notifications.ts` + the email queue, the daily
  `/api/cron/review-deadlines` job, `non_delivery_dispute_at()`, the dispute pages, hire pages.
- Mobile first; CSS-only progress bars (like the click charts); skeletons for new pages/sections.

## 4. Approaches

| | Approach | Trade-off | Decision |
|---|---|---|---|
| **1** | **Campaign-level schedule + per-hire rows created at "Start work"; evidence through the existing proof pipeline; final gate inside `submit_work()`; early dispute inside `non_delivery_dispute_at()`** | Reuses every existing seam; checkpoint state never touches engagement/money states. Costs: new tables and a builder step. | **Chosen** (my call; the owner asked to reuse existing structures) |
| 2 | Checkpoints as extra `submissions` rounds | One table, but rounds drive review deadlines and auto-release; mixing them breaks "checkpoints must not start the countdown". | Rejected |
| 3 | Per-creator rolling schedules | Simpler maths, but the owner chose a fixed shared schedule. | Rejected by owner |

Decided with the owner: fixed dates; optional; frequency 3/7/14/custom; kickoff 2 days after Start
work; a checkpoint applies only if it is ≥ 3 days after the creator's start date; late evidence
always accepted; final eligibility = all applicable checkpoints evidenced (late OK) + agreed final
deliverables + campaign final requirements; then the normal 7-day countdown; no forfeiture;
early non-delivery dispute once > 3 days overdue, after the creator was notified.

## 5. What gets built

### 5.1 Campaign timeline (all campaigns)

- **Start** = existing `post_from` ("posts go up from"). **Final delivery cutoff** = existing
  `deliver_by`. **End** = new `ends_on date` (≥ `deliver_by`): the date the campaign ends and until
  which posts must stay up (shown to creators as a term: "Keep your posts up until 31 Dec"). It is
  **display and terms only** (builder check, my call): the final submission is due by the cutoff,
  `deliver_by`, as the owner asked ("a final submission cutoff before the campaign end date");
  analytics in the final submission are whatever is available when it is submitted, with
  `captured_on` not before `post_from` and not in the future. `non_delivery_dispute_at` keeps using
  `deliver_by`.
- **New campaigns** must have `post_from` and `ends_on` before they can be submitted for listing
  (checked where draft → pending_review/open happens, `transition_campaign()`, error
  `timeline_required`). Order: `applications_close_on ≤ deliver_by`, `post_from ≤ deliver_by ≤
  ends_on`, and `post_from` not in the past at submit. Existing live campaigns keep nulls.
- Locks: `post_from` is already locked once submitted; `ends_on` may only move later, like the other
  deadlines (extend `campaigns_before_write()`).
- **Display** (business campaign page, creator campaign page, both hire pages): "Starts 1 Dec ·
  Final delivery by 20 Dec · Ends 31 Dec" and a CSS progress bar from start to end with today's
  position and markers for the cutoff and each checkpoint. Campaigns without `post_from` start the bar
  at the go-live date; without `ends_on` end it at `deliver_by`. A pure helper
  `timelineView(campaign, checkpoints, today)` returns the positions (tested).

### 5.2 Checkpoint configuration (campaign builder)

New fields on `campaigns` (all locked once submitted, like deliverables):
- `checkpoints_enabled boolean not null default false`.
- `checkpoint_interval_days integer` — 3, 7, 14 or a custom value between 2 and 30 (my call on the
  custom range); required when enabled.
- `checkpoint_evidence text[]` — what each progress checkpoint needs, at least one of
  `progress_update` (a written update, 20–1,000 chars), `content_links`, `publication_screenshots`,
  `analytics` (screenshots + structured metrics + capture date). Same for every checkpoint (my call:
  per-checkpoint differences were not asked for and would complicate the builder).
- `final_requirements text[]` — independent of checkpoints (a campaign without checkpoints may still
  require, say, analytics in the final submission): any of `content_links`,
  `publication_screenshots`, `analytics`, `final_report` (a written report, 100–1,000 chars). Empty =
  today's rule (at least one link or screenshot).

The builder gains a "Timeline" part (start, final delivery, end) and a "Checkpoints" part (switch,
frequency, evidence, a live preview of the generated dates, and the final requirements), in the
existing four-step builder's style.

**Schedule generation** (`generate_campaign_checkpoints(campaign)`, run once when the campaign leaves
draft): `campaign_checkpoints` rows `(campaign_id, seq, due_on)` for `due_on = post_from + k ×
interval` (k = 1, 2, …) while `due_on < deliver_by`. Validation at submit: at least one checkpoint
must fit, else `checkpoints_do_not_fit` ("With these dates there is no room for a checkpoint before
final delivery — shorten the interval or turn checkpoints off"). The schedule is fixed at go-live;
later extensions of `deliver_by`/`ends_on` don't add checkpoints (the terms creators accepted stay
the same — my call).

### 5.3 Per-hire checkpoints

Created inside `start_engagement()` when the campaign has checkpoints enabled (fixed-price and
per-click alike; **per-click hires get checkpoints as information only** — reminders, overdue notices
and the trail, but no dispute warning and no "dispute available" notice, since their dispute window is
the 72-hour hold, and no final requirements, since they have no final submission; the builder hides
"Final requirements" for per-click campaigns — builder check, my call):
- One **kickoff** row: `due_at = started_at + 2 days`.
- For each `campaign_checkpoints` row: **applies** if `due_on ≥ (started_at in Lagos)::date + 3`,
  else **skipped** (reason `started_after` if already past, `too_soon` if within 3 days). Skipped rows
  are recorded (status `skipped`) so the trail shows why.

Table `hire_checkpoints`: `id`, `engagement_id`, `campaign_checkpoint_id` (null for kickoff),
`kind` (`kickoff` | `progress`), `due_at timestamptz`, `status` (`skipped` | `due` | `overdue` |
`done` | `done_late` | `closed`), `skip_reason`, `evidence_at`, `created_at`. Transitions only through functions:
`due → done` (evidence before `due_at`), `due → overdue` (daily job), `overdue → done_late`
(evidence after), `due → closed` (see below), never backwards.
**When the final work goes in (builder check, my call):** an accepted final submission closes every
row still `due` whose time hasn't come (`closed`, reason `final_submitted`): the final submission
covers the rest of the work, so those checkpoints are neither notified nor required again — not on a
resubmission after a denial either (the denial is about the final work, and the final requirements
are re-checked then). A hire that ends (settled, cancelled, withdrawn, refunded) stops
generating notices; its rows stay as history.

### 5.4 Evidence

- **Kickoff** (`submit_kickoff(engagement, confirmed_brief boolean, confirmed_started boolean, note
  text, file_ids uuid[])`): both confirmations required; optional note (≤ 500) and up to 3 screenshots
  (product received, shoot scheduled…). No content required.
- **Progress** (`submit_checkpoint(hire_checkpoint uuid, note text, links text[], metrics jsonb,
  captured_on date, period_from date, period_to date, file_ids uuid[])`): must satisfy the campaign's
  `checkpoint_evidence` (validated in SQL, with a TS mirror for the form): `progress_update` → note
  20–1,000; `content_links` → 1–10 https links; `publication_screenshots` → 1–5 screenshots;
  `analytics` → ≥ 1 screenshot + `metrics` + `captured_on`.
- **Metrics** (`metrics jsonb`): per platform, any of `views`, `reach`, `impressions`, `likes`,
  `comments`, `shares`, `saves`, `link_clicks` as non-negative integers, plus optional
  `period_from/period_to`; a pure validator `parseMetrics()` in TS and the same rules in SQL.
  Self-reported, labelled "Reported by the creator", never a payment condition.
- Storage: table `checkpoint_evidence` (append-only; a later entry supersedes for display, all are
  kept), files through `proof_files` with a new nullable `checkpoint_evidence_id` attachment column
  and the existing `register_proof_file()` / orphan cleanup. Contact-detail checks on notes as for
  dispute statements (refused, not a strike).
- RLS: the hire's creator and business read the hire's checkpoints, evidence and events; admins
  read all; writes only through the functions above (creator only, own hire, hire `in_progress` or
  `denied`/`submitted` for late evidence; not after settlement).

### 5.5 Final submission eligibility (inside `submit_work()`)

For a hire on a campaign with checkpoints enabled, `submit_work()` refuses with
`checkpoints_outstanding` while any `hire_checkpoints` row is `due` or `overdue` **whose due time has
passed** (kickoff included) — a not-yet-due future checkpoint does not block an early final
submission (my call: a creator who finishes early shouldn't wait). The refusal lists which ones.
For every campaign with `final_requirements`, it also refuses `final_requirements_missing` unless the
submission meets them; `submit_work` gains optional `metrics jsonb, captured_on date, report text`
parameters (a new overload; the old call keeps working). Resubmissions after a denial must meet them
too. Once accepted, everything after is **exactly today's flow**: `review_deadline_at` = 7 days,
reminders, auto-release, denial, disputes. Checkpoint states never feed `release_overdue_submissions()`
or `settle_money()`.

### 5.6 Overdue tracking, notifications, escalation

The daily `/api/cron/review-deadlines` job (`src/lib/review-deadlines.ts`) gains one step,
`run_checkpoint_notices()` (SQL, idempotent, safe to run twice or late), for hires still running:
- **Reminder** (creator): due within the next 24 h, not yet evidenced, once.
- **Overdue** (both): `due_at` passed with no evidence → status `overdue`, once.
- **Warning** (creator): overdue ≥ 2 days → "If this stays missing, the business can open a dispute
  from <date>", once.
- **Dispute available** (business): overdue > 3 days → "You can now open a dispute about missing
  work", once.
- **Late evidence** (business): when evidence arrives for an overdue row (sent from the submit
  function, not the job); **checkpoint done** (business) for on-time evidence; **kickoff done**
  (business).
Each notice is a `notifications` row with a new kind (`checkpoint_reminder`, `checkpoint_overdue`,
`checkpoint_warning`, `checkpoint_dispute_available`, `checkpoint_done`, `checkpoint_late`,
`kickoff_done`) and a matching `checkpoint_events` row; emailed per `EMAIL_POLICY`: reminder, overdue,
warning and dispute-available `always`; done/late/kickoff in the switchable "applications" group (my
call). Nobody is told about their own action.

**Early dispute:** `non_delivery_dispute_at(e)` becomes
`least(<today's rule>, <earliest row still overdue: greatest(due_at + 3 days, the time of its
`warned` event + 24 hours)>)` — so the dispute can only open after the creator was actually warned
(owner: "creators would be notified earlier of their missed checkpoints and then dispute"); a late or
failed daily run delays the dispute rather than skipping the warning (builder check; same idea as the
per-click 72-hour notice rule). A row with no `warned` event never opens it. It applies to hires in
`in_progress` (the status today's rule covers) and only for
**fixed-price** hires on checkpoint campaigns (per-click hires keep their own dispute window — my
call: their payment is settled by clicks and they have no final submission). Because it reads only
rows **still** overdue, evidence sent late closes the window again. The dispute itself, its
statements and the admin decision are unchanged; the admin dispute page and the business/creator
hire pages show the checkpoint trail.

### 5.7 Audit trail

`checkpoint_events` (append-only, trigger rejects update/delete like `moderation_events`):
`hire_checkpoint_id`, `engagement_id`, `event` (`applied`, `skipped`, `kickoff_submitted`,
`evidence_submitted`, `evidence_late`, `reminded`, `overdue`, `warned`, `dispute_available`),
`actor` (null for the system), `detail jsonb`, `created_at`. Shown as a timeline on both hire pages
and the admin dispute and money-trail pages.

### 5.8 UI

- **Builder:** Timeline + Checkpoints + Final requirements (§5.2), with the date preview.
- **Campaign pages** (business, creator): dates, progress bar, "Checkpoints every 7 days: progress
  update, content links" and the final requirements, so a creator knows before applying.
- **Creator hire page:** after Start work, a checklist: kickoff (due date, form), each applicable
  checkpoint (requirements, due date, status chip: Due / Overdue / Done / Done late / Skipped —
  "started after this date"), evidence form; the final-submission form shows what's still
  outstanding and the final requirements.
- **Business hire page:** the same list read-only with evidence, metrics labelled "Reported by the
  creator", the trail, and the dispute button when available.
- Wording never threatens money ("No money is held back because of a missed checkpoint").

## 6. Testing

- **Unit (node):** schedule generation (interval fits/doesn't, boundary at `deliver_by`), applicability
  (`≥ start + 3`, past, too soon, Lagos date boundary at 23:00/01:00 WAT), `timelineView`,
  `parseMetrics`, evidence-requirement validator, notification words.
- **pgTAP:** timeline required at submit for new campaigns only; locks; schedule generated once and
  fixed; `start_engagement` creates kickoff + applies/skips correctly; evidence functions enforce
  requirements, role, hire state, contact-detail refusal; on-time vs late status; `submit_work`
  refused while a past-due row lacks evidence, allowed when all done/done_late, not blocked by a
  future row, final requirements enforced (also on resubmission), old signature still works for
  campaigns without requirements; **no checkpoint path writes `ledger_entries` or changes
  `engagements.status`/`review_deadline_at`**; `run_checkpoint_notices` idempotent (run twice → no
  duplicate notices/events) and stops for ended hires; `non_delivery_dispute_at` earlier by the
  overdue rule, back to today's rule after late evidence, unchanged for per-click and for campaigns
  without checkpoints; RLS for the new tables; append-only trail.
- **Race (money-race.mjs):** evidence submitted vs the daily job marking overdue; late evidence vs
  the business opening the early dispute (whichever commits first wins; no error left half-done);
  final submission vs the job.
- Existing suites unchanged for campaigns with checkpoints off.

## 7. Left to the builder

- Exact SQL shapes, index choices, function names beyond those fixed here, the builder component
  split, how the progress bar draws markers (CSS only), copy in the house voice.
- Docs: CLAUDE.md §5 (campaign fields and checkpoint states), §8 (new kinds), §12 (2026-11-22
  decisions); `docs/campaign-spec-decisions.md` (timeline + checkpoints section); `docs/TODO.md`.

## 8. Builder check (2026-11-22)

Four questions, all settled within what the owner asked for: checkpoints still to come when the final
work goes in are closed (§5.3); the final submission is due by `deliver_by` and `ends_on` is display
and terms (§5.1); the early dispute needs the warning to have been sent at least 24 hours earlier
(§5.6); per-click campaigns get checkpoints as information only and no final requirements (§5.3).
Also settled: a campaign sent back to draft regenerates its schedule on resubmission; an admin
approving a first campaign after its `post_from` has passed is refused with `timeline_in_past` so the
business picks new dates; evidence may still be added while a dispute is open (it becomes part of
the trail the admin sees).
