# Stage 5: applications, approvals and chat: design

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
| Contact details in chat | The message is **not delivered**; the sender is warned and gets a strike. Three strikes block them **from the platform**, and they can always appeal. |

Confirmed by the user, with my calls on the details:

- **A block is platform-wide.** A blocked person can sign in but sees only a
  "Your account is blocked" page (the reason, the strikes, an appeal form and
  Sign out); every other page redirects there. They can appeal at any time,
  one open appeal at a time and no more than one a day. An admin reviews
  appeals in `/admin` and either lifts the block (strikes reset to zero) or
  declines with a note the person sees; they may appeal again.
- **Flagged text is kept for admins only** (so a block can be reviewed and
  appealed) and never shown to the other person. The terms must say so
  before launch.
- **Money in flight is out of scope** until Stage 6: nothing is paid yet, so
  a block today strands nothing. Stage 6 must decide what happens to
  escrow, payouts and live campaigns of a blocked account (logged in
  `docs/TODO.md`).
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

**Admin**
- See blocked accounts, their strikes (with the flagged text) and open
  appeals in `/admin`; lift a block, or decline an appeal with a note.

**Blocked person**
- Sees the blocked page only; can submit an appeal (up to 1,000
  characters), read the admin's answer, and sign out.

## 3. Rules and invariants

Written down per CLAUDE.md §9.

- **Eligibility is checked at apply time on the server**, by calling the
  existing `campaign_problems(campaign, creator)` in the same transaction as
  the insert. Anything other than an empty list is refused with the reasons.
- **Applying is allowed only while the campaign is `open`, before the
  deadline (end of day, Lagos), and while places are free** (places not held
  by `awaiting_payment` or later engagements).
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
- **Chat:** only the two people in a thread can read or write it (RLS). The
  contact-detail check runs in app code (`findContactDetails`, already used
  for briefs and bios) before anything is stored; a flagged message goes to
  `record_chat_strike()` instead of `messages`, which stores the strike and,
  at three, sets `users.blocked_at`. Messages are 1 to 2,000 characters.
- **A block holds on the server, not just in the UI.** `requireUser()`
  (already the first call of every page and action) sends a blocked person
  to `/blocked`, and the database functions that write (`apply_to_campaign`,
  `send_message`, `approve_application` and the rest) refuse a blocked
  caller, so a stale tab or a hand-made request gets nowhere.
- **Rate limits** (in-memory, existing `createRateLimiter`): applying, and
  sending messages (20 a minute per person).

## 4. Data (one migration)

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
- `chat_strikes` (`id`, `user_id`, `conversation_id`, `kind`, `body`,
  `created_at`) readable by admins only; `users.blocked_at` and
  `users.blocked_reason` (null: not blocked). `block_appeals` (`id`,
  `user_id`, `message`, `status` open or resolved, `answer`, `created_at`,
  `resolved_by`, `resolved_at`); a person sees their own, admins see all.
- **RLS on every new table, default deny.** Creators see their own
  applications and engagements; businesses see those on their campaigns;
  admins see all. Writes go through functions (`apply_to_campaign`,
  `edit_application`, `withdraw_application`, `decide_application`,
  `approve_application`, `cancel_engagement`, `start_conversation`,
  `send_message`, `record_chat_strike`, `submit_block_appeal`,
  `resolve_block_appeal`).
- `messages` joins the Realtime publication. The browser subscribes under
  the person's own session, so RLS decides what arrives.

## 5. Screens

Following `docs/DESIGN_SYSTEM.md` (porcelain and aurora, skeleton loading
states, `PageHeader`, `Callout`, `EmptyState`, 390px first).

| Page | Who | What |
|---|---|---|
| `/campaigns/[id]` | Creator | "Applying opens soon" becomes the apply form (price, note) or, once applied, the application's status and actions |
| `/applications` | Creator | Their applications: campaign, status, price, date |
| `/business/campaigns/[id]/applications` | Business | Applicants with profile summary, price, note, and Shortlist / Reject / Approve |
| `/business/engagements/[id]/pay` | Business | The placeholder pay screen, with the time left |
| `/inbox`, `/inbox/[id]` | Both | Threads with unread counts; a thread with live messages |
| `/blocked` | Blocked person | Why, the strikes, the appeal form and the admin's answer |
| `/admin` | Admin | A "Blocks and appeals" section |

Sidebar: businesses gain **Inbox**; creators gain **Applications** and
**Inbox**; the Inbox link shows an unread badge. The business campaigns
table and campaign page show an application count. The remaining "Applying
and hiring open soon" copy (home, account, creator profile) is updated.

## 6. Testing

- **Unit (`node --test`):** price parsing (₦5,000 minimum, whole naira, no
  ceiling beyond the cap), the apply-time rules, the chat verdict (clean,
  flagged, strike count, block at three), the new sidebar links.
- **pgTAP:** RLS for every new table and role; the unique constraint; apply
  refused for ineligible, closed, past-deadline and full campaigns;
  `approve_application` over-fill (places = 1, second approval fails) and
  stale-price refusal; lapse idempotence (run twice); places can't drop
  below held; a blocked user can't apply, send or approve (every writing function refuses);
  three strikes set the block and a lift resets it; strikes and other
  people's appeals unreadable by non-admins; one open appeal at a time.
- **Browser (Playwright, production build, local Supabase, throwaway
  accounts):** apply, edit, withdraw, approve to the pay screen, lapse
  (backdated `pay_by`), message both ways with live delivery, a flagged
  message not delivered, a third strike blocking the whole account (every page redirects to
  `/blocked`), an appeal, an admin lifting it and declining it; at
  375px and 1280px.

## 7. Not in this stage

Payments, escrow, the ledger and funding (Stage 6); submissions and
disputes (Stage 7); email and push notifications, and telling applicants
by email that a brief changed (Stage 8); counter-offers as a separate
feature; message attachments; a creator starting a thread; group threads.

## 8. Docs to update in the same change

`CLAUDE.md` §12 (Stage 5 decisions), `docs/PROVIDERS.md` (Realtime),
`docs/DESIGN_SYSTEM.md` (new pages and components), `docs/TODO.md` (tick the
two Stage 4 follow-ups; add: applications on the business home, what a
block does to escrow, payouts and live campaigns (Stage 6), blocking by
an admin without strikes), `.env.example` (`CRON_SECRET`), `README.md`.
