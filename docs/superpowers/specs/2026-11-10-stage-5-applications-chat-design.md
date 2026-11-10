# Stage 5: applications, approvals, chat and enforcement: design

Date: 2026-11-10. Status: draft for review.

Builds on Stage 4 (campaigns) and the portal shell. Money rules stay in
CLAUDE.md §6; this stage writes no ledger entries and takes no payments
(Stage 6). Campaign rules: `docs/campaign-spec-decisions.md`.

## 1. Decisions

From the user (2026-11-10):

| Topic | Decision |
|---|---|
| Approval creates the engagement | Yes. Approving an application creates an `awaiting_payment` engagement at once. |
| After approving | The business is taken straight to pay. If they don't pay, the engagement stays `awaiting_payment`, the campaign status doesn't change, and the job doesn't begin. |
| Time to pay | **48 hours**, then the approval lapses and the place is freed (CLAUDE.md §12 item 2). |
| Proposed prices | Optional. Whole naira, minimum ₦5,000, no ceiling (a technical cap of the existing `MAX_PRICE_NAIRA` keeps the number storable). |
| Who messages first | The business. A creator can reply once a thread exists. |
| Contact details in chat | The message is **not delivered**; the sender is warned and gets a strike. |
| Strikes | Three-strike progressive enforcement (section 4), auditable, with appeals. Never a permanent ban from an automated detection alone. |
| Blocking | Two separate things: a person blocking another person (section 3), and strikes against an account (section 4). |
| Money | Suspension is not forfeiture, and blocking freezes nothing (section 5). |

My calls on the details (flag any you disagree with):

- **Strike 2 pauses messaging and new marketplace activity for 3 days.**
- **Strikes don't expire on their own** in this stage; an admin can void one
  (with a reason). Decay is logged in `docs/TODO.md`.
- **Flagged text is kept** with the strike, visible to the person it came
  from and to admins, never to the other person. The terms must say so
  before launch.
- **A suspended account disappears from new activity, not from its own
  records** (section 4).
- **A creator can edit their price and note while the application is
  `submitted` or `shortlisted`**; this is how a negotiated price is agreed:
  the business says what works in chat, the creator updates their proposal.
  Approval freezes it (open decision 5: no changes after).
- **Withdrawn and rejected are final** for that campaign (one application per
  creator per campaign, CLAUDE.md §5).
- **Stage 5's "pay" screen is a placeholder** (price, fee, total, the
  non-refundable-fee notice, "Payment opens soon"). Until Stage 6, approved
  engagements lapse after 48 hours. Fine before launch (sign-up is unlinked).

## 2. What each person can do

**Creator**
- Apply to an open campaign they qualify for, with an optional price and an
  optional note (up to 500 characters; phone numbers, emails, WhatsApp and
  Telegram links are refused with an error, as in briefs and bios, no strike).
  Their profile must be published and not hidden, so the business can open it.
- See their applications and each one's status; withdraw one that is
  `submitted` or `shortlisted`; edit price and note as above.
- See "The brief was edited on <date>" on an application whose campaign was
  edited after they applied (the history already exists in
  `campaign_revisions`; the email waits for Stage 8).
- Reply in a thread once a business has started it.

**Business**
- See a campaign's applications with each creator's profile (handles,
  follower range or verified count, rate, bio), the proposed price against
  the campaign price, and the note. Shortlist, reject (with an optional note
  the creator sees) or approve.
- Approve shows the price they will agree and the fee on top (existing fee
  helpers) before confirming, then goes to the pay screen.
- Cancel an `awaiting_payment` engagement (nothing was paid, so no fee); the
  place is freed.
- Start a thread with a creator from an application or from the creator's
  profile page (replacing "Messaging and hiring open soon").

**Both:** block and unblock another person; see their own account standing
and appeal.

**Admin:** review suspensions and appeals, void a strike, lift a suspension
(section 4), each with a written reason.

## 3. Blocking (person to person)

`user_blocks (blocker_id, blocked_id, created_at)`, one row per pair.
Blocking is the blocker's own choice and touches nothing else.

- While a block exists in either direction: no new thread, no new messages in
  an existing thread, no new application to the other person's campaigns, and
  the business can't approve that creator. The refusal is generic ("You can't
  do this with this person"); the blocked person isn't told they were blocked.
- **Kept as they are:** existing threads (readable, no new messages),
  applications, engagements, campaigns and any money. Blocking never
  cancels, pauses, freezes or settles anything; a disagreement about a live
  job goes through the dispute process (Stage 7).
- Block from a thread, an application card or a profile; unblock from
  Account, "Blocked people". Blocking is never a strike and a block alone
  never restricts an account.

## 4. Strikes (account enforcement)

**What earns a strike:** a chat message that contains contact details (the
existing `findContactDetails` check: phone numbers, emails, WhatsApp and
Telegram links). The message is not stored in the thread and not delivered.
The sender sees what it looked like ("This looks like a phone number"), the
strike count, and how to appeal.

**Escalation** (counting a person's active strikes, those not voided):

| Active strikes | Effect |
|---|---|
| 1 | Warning. Normal access. |
| 2 | Messaging and **new** marketplace activity paused for 3 days: no messages, no new threads, no new applications, no new approvals. Existing campaigns, engagements, records and money are untouched, and still visible. |
| 3 | **Suspended** (`suspended_at`) and raised for admin review. Same refusals as above, with no end date. Their open campaigns stop being listed and stop taking applications; their creator profile stops appearing in the directory (status and data unchanged, so lifting restores everything). Existing engagements stay exactly as they are until an admin decides. |

Suspension is a holding state pending a person's review, not a ban: an admin
can lift it. No automated detection ever bans anyone permanently.

**Rules**
- **Server-side.** Every function that starts something new calls one
  `check_standing(user)`, which refuses a restricted or suspended caller with
  the reason. Reading, and acting on existing engagements, stays open. The
  portal layout shows a banner while restricted or suspended, linking to
  `/account/standing`.
- **Idempotent.** A strike carries a `dedupe_key` (a uuid the message form
  creates per send, unique per person), so a double submit or retry is one
  strike.
- **Immutable audit.** `moderation_events` is append-only (a trigger refuses
  updates and deletes): `strike`, `strike_voided`, `suspension_lifted`,
  `appeal_declined`, each with who did it (system or an admin), when, and a
  reason. Standing is always explainable from it.
- **False positives.** A person can appeal any active strike. An admin can
  void it (a new `strike_voided` event; the count drops and a restriction or
  suspension that no longer fits is lifted, with a reason).
- **Admin overrides always need a written reason** (2 to 200 characters,
  like campaign takedowns), enforced in the function and by a check
  constraint.
- **Appeals.** `moderation_appeals`: one open at a time, at most one a day,
  up to 1,000 characters. An admin answers: void strikes, lift the
  suspension, or decline with a note the person sees. They can appeal again.
- **Notice.** In this stage: the inline warning, the standing banner and
  `/account/standing`. Email waits for Stage 8.

## 5. Money and campaigns

Stage 5 builds **no** escrow, holds or payout logic; it only sets the rules
Stage 6 will follow, written into CLAUDE.md as §6.5.

- Suspension is not forfeiture, and blocking freezes nothing.
- Enforcement code never writes to the ledger or moves an engagement
  between money states. Completed and approved earnings stay payable unless
  an admin records a specific dispute, fraud or legal reason.
- Any future hold targets a specific transaction or amount, is created by an
  admin with a required reason, and is auditable. A hold is its own record,
  not a flag on the account; it is built in Stage 6 or 7 when there is money
  to hold.
- Escrow is settled by the campaign's own rules (Stages 6 and 7), whoever
  is blocked or suspended.
- Campaigns and engagements keep their history and deliverables regardless
  of enforcement. A suspension lists the person's campaigns and engagements
  for the admin and changes none of them. Pausing or stepping into a
  specific campaign is admin intervention through the existing campaign
  rules; no new campaign state is added.

## 6. Rules and invariants

Written down per CLAUDE.md §9.

- **Eligibility is checked at apply time on the server**, by calling the
  existing `campaign_problems(campaign, creator)` in the same transaction as
  the insert. Anything other than an empty list is refused with the reasons.
- **Applying is allowed only while the campaign is `open`, before the
  deadline (end of day, Lagos), and while places are free** (places not held
  by `awaiting_payment` or later engagements), and only if neither side has
  blocked the other and the applicant's standing allows it.
- **One application per creator per campaign** (unique constraint).
- **Places are never over-filled.** `approve_application()` locks the
  campaign row (`for update`), counts held engagements, and inserts, in one
  transaction. Two clicks at once: the second sees the places taken and
  fails.
- **A held place** is an engagement in any status except `cancelled` and
  `refunded`. Cancelling or lapsing frees it.
- **Price is frozen at approval.** `approve_application(application,
  expected_price_kobo)` fails if the proposal changed since the business
  loaded the page (the creator edited it in between), so nobody approves a
  price they didn't see. The engagement's `agreed_price_kobo` is the proposal
  or the campaign price; the fee is computed from it at payment (Stage 6).
- **Lapsing is idempotent.** `expire_unpaid_engagements()` cancels
  `awaiting_payment` engagements past `pay_by`, with reason
  `payment_expired`; running it twice, or late, changes nothing more.
  `approve_application` also runs it for its own campaign first, so a lapsed
  approval never blocks a place. A plain route handler
  (`/api/cron/expire-engagements`, protected by a `CRON_SECRET` header)
  calls it on a schedule (Vercel Cron or `pg_cron` only trigger it,
  CLAUDE.md §2a).
- **Campaign places can't drop below the number held** (finishes the Stage 4
  follow-up in `campaigns_before_write`).
- **Campaign status doesn't change in Stage 5.** It becomes `in_progress`
  with funding in Stage 6.
- **Chat:** only the two people in a thread can read or write it (RLS).
  Order in the send action: authenticate, authorize (a participant, standing,
  no block), rate limit, validate (1 to 2,000 characters), contact check
  (app code), then either store the message or record the strike.
- **Rate limits** (in-memory, existing `createRateLimiter`): applying,
  messages (20 a minute per person) and appeals.

## 7. Data (one migration)

- `application_status` enum: `submitted`, `shortlisted`, `approved`,
  `rejected`, `withdrawn`. `applications`: `id`, `campaign_id`, `creator_id`
  (our users id), `status`, `proposed_price_kobo` (null: accepts the campaign
  price; whole naira, at least 500000, at most the campaign maximum),
  `note`, `decision_note`, `created_at`, `updated_at`; unique
  `(campaign_id, creator_id)`.
- `engagement_status` enum with the full list in CLAUDE.md §5 (`awaiting_payment`,
  `funded`, `in_progress`, `submitted`, `accepted`, `denied`, `paid_out`,
  `disputed`, `auto_released`, `cancelled`, `refunded`), so later stages add
  no values. `engagements`: `id`, `application_id` (unique), `campaign_id`,
  `business_id`, `creator_id`, `status`, `agreed_price_kobo`, `approved_at`,
  `pay_by`, `cancelled_at`, `cancel_reason`. Stage 5 only moves
  `awaiting_payment` to `cancelled`; all status changes go through database
  functions, never client updates.
- `conversations` (`id`, `business_id`, `creator_id`, `application_id`
  nullable, `created_at`; unique per business and creator),
  `messages` (`id`, `conversation_id`, `sender_id`, `body`, `created_at`),
  `conversation_reads` (`conversation_id`, `user_id`, `last_read_at`) for
  unread counts.
- `user_blocks` (section 3). `moderation_events` (`id`, `user_id`, `kind`,
  `actor_id` null for the system, `strike_id` for voids, `reason`, `detail`
  for the flagged text, `dedupe_key`, `created_at`; unique
  `(user_id, dedupe_key)`; append-only). `moderation_appeals` (`id`,
  `user_id`, `message`, `status`, `answer`, `created_at`, `resolved_by`,
  `resolved_at`). On `users`: `messaging_restricted_until` and
  `suspended_at`, set only by the functions below.
- **RLS on every new table, default deny.** Creators see their own
  applications and engagements; businesses see those on their campaigns;
  people see their own blocks, events and appeals; admins see all. Writes go
  through functions (`apply_to_campaign`, `edit_application`,
  `withdraw_application`, `decide_application`, `approve_application`,
  `cancel_engagement`, `start_conversation`, `send_message`, `block_user`,
  `unblock_user`, `record_strike`, `void_strike`, `lift_suspension`,
  `submit_appeal`, `answer_appeal`), each calling `check_standing` and the
  block check where they start something new.
- `list_open_campaigns` and the creator search leave out suspended accounts.
- `messages` joins the Realtime publication. The browser subscribes under
  the person's own session, so RLS decides what arrives.

## 8. Screens

Following `docs/DESIGN_SYSTEM.md` (porcelain and aurora, skeleton loading
states, `PageHeader`, `Callout`, `EmptyState`, 390px first).

| Page | Who | What |
|---|---|---|
| `/campaigns/[id]` | Creator | "Applying opens soon" becomes the apply form (price, note) or, once applied, the application's status and actions |
| `/applications` | Creator | Their applications: campaign, status, price, date |
| `/business/campaigns/[id]/applications` | Business | Applicants with profile summary, price, note, and Shortlist / Reject / Approve |
| `/business/engagements/[id]/pay` | Business | The placeholder pay screen, with the time left |
| `/inbox`, `/inbox/[id]` | Both | Threads with unread counts; a thread with live messages and a Block action |
| `/account/standing` | Both | Strikes with dates and what was flagged, the current restriction, the appeal form and answers |
| `/account` | Both | A "Blocked people" section |
| `/admin` | Admin | A "Standing review" section: suspensions (with the person's campaigns and engagements listed), open appeals, recent strikes; Void, Lift and Decline each ask for a reason |

Sidebar: businesses gain **Inbox**; creators gain **Applications** and
**Inbox**; the Inbox link shows an unread badge. The business campaigns
table and campaign page show an application count. The remaining "Applying
and hiring open soon" copy (home, account, creator profile) is updated.

## 9. Testing

- **Unit (`node --test`):** price parsing (₦5,000 minimum, whole naira, no
  ceiling beyond the cap), the apply-time rules, the chat verdict and the
  escalation rule (1 warning, 2 pause for 3 days, 3 suspend; voids step it
  back), false positives (prices like ₦50,000, dates, short numbers and
  handles are not flagged) and the new sidebar links.
- **pgTAP:** RLS for every new table and role; the unique constraints; apply
  refused for ineligible, closed, past-deadline and full campaigns;
  `approve_application` over-fill (places = 1, second approval fails) and
  stale-price refusal; lapse idempotence (run twice); places can't drop
  below held; blocks in both directions stop messages, applications and
  approvals while leaving threads, applications, engagements and campaigns
  unchanged; a duplicate `dedupe_key` is one strike; the second strike
  restricts and it expires; the third suspends and leaves campaigns and
  engagements untouched; a suspended account drops out of the lists; events
  can't be updated or deleted; every admin action refuses a missing reason;
  voiding lifts what no longer fits; one open appeal at a time; no
  enforcement function touches an engagement's status.
- **Browser (Playwright, production build, local Supabase, throwaway
  accounts):** apply, edit, withdraw, approve to the pay screen, lapse
  (backdated `pay_by`), message both ways with live delivery, a flagged
  message not delivered with the warning, the second and third strikes and
  their banners, a block hiding nothing but stopping new contact, an appeal
  answered both ways; at 375px and 1280px.

## 10. Not in this stage

Payments, escrow, the ledger, funding and any payout or withdrawal hold
(Stage 6, with Stage 7 for disputes); email and push notices, and telling
applicants by email that a brief changed (Stage 8); strikes that expire by
themselves; admin-issued strikes and bans; an admin pausing a single
campaign; counter-offers as a separate feature; message attachments; a
creator starting a thread; group threads.

## 11. Docs to update in the same change

`CLAUDE.md` (§6.5 "Enforcement and money", §12 Stage 5 decisions),
`docs/PROVIDERS.md` (Realtime), `docs/DESIGN_SYSTEM.md` (new pages and
components), `docs/TODO.md` (tick the two Stage 4 follow-ups; add:
applications on the business home, strike decay, hiding a blocker's
campaigns from the person they blocked, what Stage 6 does with a suspended
account's payouts), `.env.example` (`CRON_SECRET`), `README.md`.
