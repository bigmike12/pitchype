# Admin overview figures and unread-message emails (short design)

Date: 2026-11-22. Status: approved by the owner. Two small, independent changes on branch
`pre-merge-updates` (stacked on `identity-verification`; nothing is merged until the owner has set up
keys and sandboxes).

## A. Unread-message emails

**Intent:** chat emails were too eager (15 minutes) and on for everyone. The owner wants them off by
default for new people and sent only when a message is still unread after 6 hours.

**What changes**
- `notify()` sets a `new_message` notification's `email_due_at` to **now + 6 hours** (was 15 minutes).
- The per-thread cap becomes **one email per 6 hours** (was one an hour) so the cap matches the
  delay (my call).
- The existing rule stays: a thread read before the due time sends nothing
  (`src/lib/send-emails.ts` skips `new_message` with `read_at` set).
- **Default off for new users:** `notification_preferences.email_messages` default `false`; the
  email claim function's fallback for people with no saved row becomes `coalesce(p.email_messages,
  false)`; `src/lib/notification-email.ts` default `messages: false`; the settings form's unticked
  default follows.
- **Existing users keep today's behaviour (my call):** the migration first inserts a
  `notification_preferences` row (`email_messages = true`, other two `true`) for every existing user
  who has none, so nobody silently loses emails they never turned off. Users with a saved row are
  untouched.
- Label: "Messages (only if you haven't read them after 6 hours)".
- Docs: CLAUDE.md §8 ("15 minutes later for chat, and a chat thread gets at most one email an hour")
  and PROVIDERS.md's send-emails row.

**Approaches:** only one sensible way (change the existing queue's numbers and defaults); a separate
"digest" system was not asked for.

**Tests:** pgTAP (`email_queue`-style): a new message's due time is 6 h; a second message in a
thread inside 6 h of an email doesn't email again; a person with no row gets no chat email; an
existing person backfilled gets one; the preference default is false. Node: default prefs, label,
send skip for a read thread (existing test still passes).

## B. Admin overview figures

**Intent:** the admin home shows only queues today; the owner wants a high-level view of activity
and money, from real records, with revenue clearly separate from volume.

**What changes**
- A new admin-only SQL function `admin_platform_overview() returns jsonb` (role checked inside,
  `security definer`, granted to `authenticated`):
  - `businesses`, `creators`: count of `users` by role (admins excluded).
  - `campaigns_total` (all except drafts) and `campaigns_live` (`open` or `in_progress`).
  - `paid_in_kobo`: money paid in by businesses = sum of **positive** ledger amounts on the cash
    accounts (`paystack`, `cray`) in `payment_received` and `deposit_received` groups. This is the
    "volume" figure.
  - `paid_out_kobo`: money that reached creators = sum over `payouts` with status `paid` of
    `amount_kobo − transfer_fee_kobo` (reversed payouts are not `paid`, so they're excluded).
  - `revenue_kobo`: Pitchype's revenue = the negated balance of the `platform_revenue` account
    (fees kept, net of per-click fee returns).
  - `as_of`: now.
- The admin home (`src/app/(portal)/(admin)/admin/page.tsx`) gets a first section **"Platform"**
  with `StatCard`s: Businesses, Creators, Campaigns (total, "N live"), and a **"Money"** row: "Paid in
  by businesses", "Paid out to creators", and a visually separate "Pitchype revenue (our fees)" card.
  The money cards show a "Test mode" label when the active provider's credentials are test ones
  (Paystack key starting `sk_test_`; `CRAY_BASE_URL` containing `sandbox`), decided on the server. The existing queue cards stay below.
- Figures use `formatNaira`; nothing is rounded beyond whole naira display; no estimates.

**Tests:** pgTAP: the function refuses non-admins; counts and the three money figures equal a
hand-built ledger fixture (a card payment, a deposit, a settled hire with fees, a paid payout, a
reversed payout, a per-click fee return). Node: any pure helper for the cards.

**Non-goals:** charts, date ranges, per-provider splits, exports.
