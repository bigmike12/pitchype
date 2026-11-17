# Stage 7: submissions, review, auto-release and disputes: design

Builds on Stage 6 (hires are paid into escrow, the creator presses Start work,
an admin can settle). Money rules stay in CLAUDE.md §6; this document adds the
decisions and the shape. Status: approved 2026-11-17 (the owner asked to build it); built on branch
stage-7-submissions.

## 1. Intent

A creator who has started a paid job can submit proof of the work. The business
accepts it (escrow is released to the creator, less our fee) or denies it with
written reasons. The creator can fix it and resubmit, or either side can ask an
admin to decide. If the business says nothing for 7 days, the money is released
anyway.

**Why:** this closes the money loop. Businesses trust us because nothing is paid
until they approve; creators trust us because a silent business can't hold their
money hostage (CLAUDE.md §1). Stage 6 built settlement; Stage 7 only decides
*when* to call it.

**Goals**
- Submit proof (links, screenshots, a note) on an `in_progress` job.
- Business review: accept, or deny with one or more reasons.
- Up to **3 resubmissions** after denials (4 submissions in all).
- **7-day auto-release**, reminders before it, safe to run twice or late.
- **Disputes**: either side can open one after a denial; the business can also
  open one when the creator hasn't delivered. An admin decides: release,
  refund, split, or refund with the creator at fault.
- A creator can withdraw after starting (treated as creator at fault, §6.2).

**Non-goals** (do not build)
- Email (Stage 8). Reminders and notices are in-app only.
- Proof per deliverable, automatic checking of posts, platform APIs.
- Changing the price after funding (§12.5 stays "no").
- Mutual cancellation by agreement after work started (a dispute covers it:
  the business opens one and says the creator agreed).
- Business wallet withdrawal (§12.9 stays open).
- Pay per click.

**Anti-goals:** money released twice; released by the browser's say-so; a
business able to deny after its deadline passed; a denial with no reason; a
creator's money stuck with no button anyone can press.

## 2. Decisions

| Question | Decision |
|---|---|
| Resubmission limit | 3 resubmissions after denials, so at most 4 submissions per hire. (Closes the first half of §12.3; decided 2026-11-17.) |
| Who can open a dispute | Either side, from `denied` (after any denial, not only the last). The business also from `in_progress` once the campaign's deliver-by date has passed (creator hasn't delivered). Decided 2026-11-17, the deliver-by condition is my call. |
| Who decides a dispute | An admin, from a new `/admin/disputes` page, with a written reason. Same four outcomes as the Stage 6 escrow tool. (Closes the second half of §12.3, timelines in §4.) |
| Review window | 7 days from each submission, stored as `review_deadline_at` (§6.9). Stops on denial or dispute; a resubmission starts a new 7 days. |
| Reminders | To the business at 3 days left and 1 day left (CLAUDE.md suggested days 3 and 6). In-app only until Stage 8. |
| Proof | Up to 10 links (http/https), up to 5 screenshots (JPEG, PNG or WebP, 5 MB each), a note up to 1,000 characters. At least one link or one screenshot. |
| Creator withdraws after starting | Allowed from `in_progress` or `denied`, with a confirmation. Settles as `refund_creator_fault` (§6.2 row "influencer withdraws"). |
| Business accepts during a dispute | Allowed: it releases in full and closes the dispute. Nobody else ends a dispute except an admin or the person who opened it withdrawing it. |
| `paid_out` status | Stays in the enum, never used (dropping an enum value means rebuilding the type, which costs more than it's worth). Comment it in the migration. |

## 3. How it flows

```
in_progress ──submit──▶ submitted ──accept──▶ accepted         (release, creator fee)
     │                     │  └──7 days, no answer──▶ auto_released (release, creator fee)
     │                     └──deny (reasons)──▶ denied
     │                                            ├─resubmit (rounds left)──▶ submitted
     │                                            ├─open dispute (either)──▶ disputed
     │                                            └─creator withdraws──▶ refunded (creator at fault)
     ├─creator withdraws──▶ refunded (creator at fault)
     └─open dispute (business, after deliver-by)──▶ disputed
disputed ──admin decides──▶ accepted | refunded
disputed ──business accepts──▶ accepted
disputed ──opener withdraws dispute──▶ back to the status it came from
```

**Settlement** stays in one place. Every path that moves money calls
`settle_money()` through `settle_engagement_internal()`, which this stage:
- widens from `funded`/`in_progress` to also `submitted`, `denied` and
  `disputed`;
- takes the engagement status to set (today it always sets `accepted` or
  `refunded`; auto-release must set `auto_released`). Add a parameter rather
  than a second function.

Settling a settled hire stays a no-op (it checks `settled_at` first).

**The deadline is enforced in the database, not by the job.** Before
`accept_submission` and `deny_submission` run on a `submitted` hire, they
release it if `review_deadline_at` has passed. So:
- a business that denies after the deadline gets the outcome `review_closed`
  (returned, not raised, so the release in the same transaction is kept) and
  the hire is auto-released;
- an accept after the deadline still releases, as `auto_released`;
- the daily job only catches the hires nobody touched.

This is the same pattern as `expire_unpaid_engagements()` running before every
approval (CLAUDE.md §5). Unlike the lapse, auto-release moves money, so
`engagement_json` does **not** pretend an overdue hire is released: the status
stays `submitted` until the ledger says otherwise, and the screens word it as
"Review time ended on [date]; the money is being released" (it reaches the
wallet at the next daily run, or sooner if the business opens the hire).

A dispute can't be opened on a `submitted` hire: the business denies first
(the denial's reasons are what the dispute is about). Denying stops the clock,
which is how CLAUDE.md §6.9's "denies or opens a dispute" is met.

**Locks:** same order as Stage 6: the business's `users` row, then the
engagement, then the submission or dispute. Accept, deny, auto-release, open
dispute, withdraw and admin settle all take the engagement lock, so two of them
can't both win.

## 4. Disputes

- Opening needs a written reason (20–2,000 characters) and may carry proof in
  the same shape as a submission.
- Both people and admins see the dispute: the reason, every statement, the
  submission history with each denial's reasons, and the hire's terms snapshot.
- Each person can add statements (text plus optional links and screenshots)
  until it's decided. Statements are append-only. Admins can add statements
  too, to ask questions. Statements go through the contact-details check:
  refused, not a strike (strikes belong to chat, §6.5).
- **Timelines:** the other side is asked to respond within 3 days; an admin
  aims to decide within 5 working days of opening. Both are shown as
  expectations, not enforced by code. Nothing settles by itself while a
  dispute is open.
- The person who opened it can withdraw it while undecided; the hire goes back
  to the status it came from (`denied` or `in_progress`). Withdrawing has no
  money effect.
- **Admin guidance** (shown on the decide screen, not enforced): creator at
  fault means the creator didn't deliver, delivered something clearly off the
  brief, or walked away after starting. A partial delivery is a split. Work
  that met the brief is a full release even if the business changed its mind.
- Deciding writes the outcome and reason on the dispute and settles the hire in
  one transaction. One open dispute per hire at a time (a partial unique index).

## 5. Data (migrations, plus types regenerated)

**`submissions`** (one row per round)
- `id`, `engagement_id`, `round` (1–4, unique per engagement), `note`,
  `links text[]`, `created_at`, `review_deadline_at`
- `status`: `pending_review | accepted | denied | auto_accepted`, check
  constrained. `auto_accepted` is the submission-side word for auto-release
  (CLAUDE.md §5).
- `decided_at`, `decided_by`, `denial_reasons text[]` (non-empty when
  denied, each 3–500 characters, at most 5)
- `reminded_3d_at`, `reminded_1d_at` so each reminder is sent once.
- Constraint: at most one `pending_review` per engagement (partial unique index).

**`submission_files`**: `submission_id` or `dispute_statement_id` (exactly one),
`path`, `content_type`, `bytes`, `position`. Files live in a new private bucket
`work-proof`, written only by the server, read through short-lived signed URLs
(new functions in `src/lib/storage.ts`). Processed on the server with sharp
like profile photos: metadata stripped (GPS), longest side 2,000 px, WebP.

**`disputes`**
- `id`, `engagement_id`, `opened_by`, `opened_from` (`denied | in_progress`),
  `reason`, `opened_at`
- `status`: `open | withdrawn | decided`; `closed_at`, `closed_by`,
  `outcome` (`release | refund | split | refund_creator_fault | accepted_by_business`),
  `decision_reason`
- Partial unique index: one `open` dispute per engagement.

**`dispute_statements`**: `id`, `dispute_id`, `author_id`, `body`, `links`,
`created_at`. Append-only (trigger rejects update and delete, like the ledger).

**Engagements:** no new columns; status carries the state and the current
round is the latest submission.

**Functions** (all `security definer`, `search_path = ''`, checking the caller
inside; none callable by `anon`):
- `submit_work(engagement, note, links, file_ids)`: the creator, from
  `in_progress` or `denied` with rounds left. Sets `review_deadline_at = now() + 7 days`.
- `accept_submission(engagement)`: the business. Releases in full.
- `deny_submission(engagement, reasons)`: the business, before the deadline.
- `open_dispute(engagement, reason, links, file_ids)` (from `denied`, or
  `in_progress` past the non-delivery date in §11.4), `add_dispute_statement(...)`,
  `withdraw_dispute(dispute)`, `decide_dispute(dispute, outcome, release_kobo, reason)` (admin).
- `withdraw_from_engagement(engagement)`: the creator, from `in_progress` or `denied`.
- `release_overdue_submissions()`: service role only; the daily job. Returns
  how many it released.
- `send_review_reminders()`: service role only; the daily job.

Uploads: the server action uploads processed files first (rows with no parent,
owned by the uploader), then passes their ids to the function, which attaches
them under the same lock. Orphans older than a day are deleted by the daily job.

RLS: people read submissions, files and disputes of their own hires; admins read
all. No direct writes for any role.

**Notifications** (triggers plus cases in `describeNotification`; never the actor):

| Kind | To | When |
|---|---|---|
| `work_submitted` | business | a submission is made (says the deadline) |
| `submission_denied` | creator | denied, with the reasons and rounds left |
| `review_reminder` | business | 3 days and 1 day left |
| `dispute_opened` | the other person | a dispute is opened |
| `dispute_statement` | the other person | a new statement |
| `dispute_withdrawn` | the other person | the opener withdrew it |
| `engagement_settled` | both, except the actor | existing; now skips the business on its own accept, and words `auto_released` and dispute outcomes |

`engagements_money_notify` must learn the actor. Settlement passes it already
(`settle_money(..., actor, ...)`), so the trigger can read it from the
`hire_settled` ledger group's `actor_id`.

## 6. Screens

- **Creator job page** (`/jobs/[id]`): a "Submit your work" panel on
  `in_progress` (the campaign's deliverables as a checklist to look at, not
  saved), the history of rounds with each denial's reasons and "N resubmissions
  left", Resubmit and Open a dispute after a denial, Withdraw from the job with
  a confirmation that says the business is refunded.
- **Business hire page** (`/business/engagements/[id]`): the submission with
  links and screenshots, "Review by [date], or it's released automatically",
  Accept (confirm: "₦X goes to [creator]") and Deny (reasons, at least one).
  Open a dispute on a denied hire, or on `in_progress` after the deliver-by
  date.
- **Dispute page** shared by both people and admins (`/disputes/[id]` under each
  role's area): the reason, statements in order, add a statement, withdraw (opener).
- **Admin** `/admin/disputes`: open disputes oldest first, with days open; a
  decide screen reusing the Stage 6 settle preview (`settle-preview.ts`) so the
  admin sees exactly who gets what before confirming.
- **Boards:** add "To review", "Changes asked" and "In dispute" columns to the
  business board and the creator's jobs list (TODO line 505).
- Every new page gets a skeleton loading state (CLAUDE.md §4a) and is checked
  at 390 px.

## 7. Approaches considered

1. **A `submissions` table, one row per round, and a `disputes` table**
   (chosen). Each round keeps its proof, reasons and deadline; an admin judging
   a dispute sees the whole history. The engagement status still says where
   things stand.
2. **Columns on the engagement for the current submission.** Fewer tables, but
   each round overwrites the last, and disputes need the history. Rejected.
3. **Submissions as special chat messages.** Reuses chat UI, but mixes money
   state into chat and its RLS, and chat blocking would block review. Rejected.

Auto-release: **daily cron route plus the deadline check inside every action**
(chosen; the existing `expire-engagements` pattern, runs on any Node host,
§2a). `pg_cron` was rejected: it ties a money job to Supabase. A more frequent
cron isn't needed because no action can act on a stale deadline.

Proof: **links plus screenshots** (chosen). Links alone fail for stories, which
disappear after 24 hours. Arbitrary files (video) are left out: big uploads on
slow networks, and a link to the post covers video.

## 8. Testing

pgTAP (`supabase/tests/`):
- `submissions.test.sql`: only the creator submits, only from `in_progress` or
  `denied`; a fifth submission is refused; denial needs a reason; accept
  releases with the creator fee and sets `accepted`; deny after the deadline is
  refused and auto-releases; accept after the deadline sets `auto_released`;
  the business can't act on another business's hire; RLS on every new table;
  no direct writes.
- `auto_release.test.sql`: releases only `submitted` past the deadline;
  running twice releases once; a denied or disputed hire is not released;
  reminders sent once each.
- `disputes.test.sql`: who can open from which status; the deliver-by rule;
  one open dispute per hire; statements are append-only; withdraw restores
  the previous status; each outcome settles exactly as the Stage 6 tool does;
  a business accept during a dispute closes it.
- Extend `money_notifications.test.sql`: the business isn't told about its own
  accept; the creator hears about auto-release.

Races (`scripts/money-race.mjs`): accept vs auto-release; deny vs
auto-release at the deadline; admin decide vs business accept; two submits.

Unit (`src/lib/*.test.ts`): job and hire status words for every new status;
the deadline and reminder date maths; proof validation (link count, URL
scheme, file types and sizes).

Browser: the full happy path, a denial and resubmission, a dispute decided as a
split, and an auto-release (move `review_deadline_at` back in the local
database), as business, creator and admin, at 390 px and desktop.

## 9. Left to the builder

- Exact wording of every screen and notice (plain, like the rest of the portal).
- Whether the dispute page is one route reused under each role's area or one
  shared route; follow the portal's layout rules.
- Migration split (one or several files) and function names, as long as the
  ones Stage 6 documented keep working.
- How reminders word "1 day left" near midnight (show the date, store UTC).

## 10. Docs to update in the same change

- CLAUDE.md §5 (Submission now built), §6.6 (settlement statuses, who calls
  `settle_engagement_internal`), §8 (new notification kinds), §12 (close item 3
  with the decisions above).
- `docs/PROVIDERS.md`: the `work-proof` bucket and the new cron route.
- `docs/TODO.md`: tick the Stage 7 items (lines 236, 359, 364, 505); add email
  for these notices to Stage 8.
- `docs/legal/terms.md` sections 6 and 7: fill in the resubmission limit and
  dispute timelines.
- `vercel.json`: the new cron route (`/api/cron/review-deadlines`, daily).

## 11. Calls made after the builder check (mine, for you to check)

1. **No dispute from `submitted`.** The business denies first; the denial stops
   the clock. `opened_from` stays `denied | in_progress`, and withdrawing a
   dispute never needs to restore a review deadline.
2. **The Stage 6 admin escrow tool stays on `funded` and `in_progress`.**
   `settle_engagement` keeps its old status check; only the new Stage 7
   functions (accept, auto-release, `decide_dispute`, creator withdraw) reach
   `submitted`, `denied` and `disputed`. An admin can't override a business's
   review without a dispute record, and a dispute can't end settled while its
   row says `open`. `decide_dispute` closes the dispute and settles in one
   transaction.
3. **No fake "released" status** (section 3). The screen says "being
   released" until the ledger moves.
4. **Non-delivery disputes** are allowed once the later of the campaign's
   current `deliver_by` (end of that day, Lagos time) and `started_at` plus 7
   days has passed. A creator who starts late always gets a week.
5. **No new terms snapshot.** The dispute page shows the current campaign,
   which is safe for price, requirements and deliverables (locked once live),
   and the hire's price and fee from the engagement. Building the snapshot
   decided in `campaign-spec-decisions.md` goes to `docs/TODO.md`.
6. **Campaigns aren't moved to `completed`** in this stage. Added to
   `docs/TODO.md`.
7. **The contact-details check** applies to statement text, not to proof
   links (links to other apps are the point of proof).
