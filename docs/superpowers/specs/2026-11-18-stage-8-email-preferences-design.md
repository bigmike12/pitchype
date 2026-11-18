# Stage 8: email notifications and preferences (design)

Date: 2026-11-18. Status: draft for approval. Scope: email and preferences
only. Paid features (featured placement, alert subscriptions) are a later
stage.

## Intent

Today a person only hears about something if they open Pitchype and look at
the bell. A creator can miss that a hire was paid and work can start; a
business can miss a submission and the 7-day review clock runs out. Stage 8
sends an email for the same events the bell already shows, so people come
back when it matters, and lets them turn off the emails that are only
"something happened".

An email means: **you need to act, or money moved.** Anything else can be
switched off.

## Goals

- Every notification row can become one email, through Resend, with the same
  words and link as the bell (`describeNotification`), so the two never drift.
- Money and deadline emails always send, whatever the person's settings
  (CLAUDE.md §8).
- Each person can switch off three groups: applications and hiring, campaign
  updates, messages. Everyone starts with all three on.
- Each email is sent once. Failures retry a few times, then stop.
- Chat does not become spam: one email per thread, only if still unread after
  15 minutes.

## Non-goals and anti-goals

- No paid features, digests, or per-event switches.
- No "you applied" receipts. Every notification goes to the other person, and
  Stage 8 keeps that rule.
- No admin notifications (admins have no bell; `docs/TODO.md` §11 keeps that
  item open).
- No marketing or waitlist email. Only transactional email off `notifications`.
- No second notification system. Email is a delivery channel off the one
  table (CLAUDE.md §8). Failure mode to avoid: an email telling a creator to
  start work before the business has paid. Email copy comes from
  `describeNotification`, never from separate templates with their own advice.
- No new dependency (Resend is called with `fetch`, like Paystack).

## Constraints

- Vercel Hobby cron runs once a day, so a schedule alone is too slow for
  money emails. Money emails are therefore sent right after the action that
  caused them (see "When a send runs"). A Supabase `pg_cron` + `pg_net` call
  every minute is only a backstop for the chat delay and for retries; the
  scheduler only triggers a plain route handler (CLAUDE.md §2a). If it is
  not set up, emails still go out immediately and the daily jobs sweep up
  the rest.
- A send never runs inside a money transaction, and a failed send never
  fails the action that caused it.
- Resend is a provider boundary: only `src/lib/resend.ts` may call it, and
  `docs/PROVIDERS.md` gets a section in the same change.
- Schema changes only through new migrations; `notify()` stays the one writer
  of notification rows.
- Never log full email bodies or secrets.

## Approaches

1. **A send queue on `notifications`, drained right after actions and
   webhooks, with a per-minute backstop.** Chosen. Money emails go out in
   seconds, nothing is lost if Resend is down, chat gets its 15-minute
   check, and preferences are checked at send time. Cost: a one-off
   scheduler setup on the hosted Supabase project, which can come after
   launch.
2. **Send directly from each server action, with no queue.** Rejected: many
   notifications come from database functions and cron jobs (lapse,
   auto-release, reminders, stranded payments, admin settlement), so events
   would be missed; a failed send is lost; and the chat delay has nowhere to
   live.
3. **A trigger calls the app instantly through `pg_net`.** Rejected: a lost
   request is a lost email, nothing retries, and the database must know the
   app's URL.

Also considered and rejected: a Vercel-only daily cron (up to 24 hours late),
and dropping the per-minute backstop (chat emails could be a day late).

## Design

### Which kinds email, and which can be switched off

A lookup object in `src/lib/notification-email.ts` maps every kind to
`always`, or one of three groups. A kind missing from it is never emailed.
A unit test fails if `describeNotification` handles a kind that has no entry.

| Group (switchable) | Kinds |
|---|---|
| Applications and hiring | `application_received`, `application_updated`, `application_withdrawn`, `application_shortlisted`, `application_passed`, `hire_cancelled`, `work_started` |
| Campaign updates | `campaign_approved`, `campaign_sent_back` |
| Messages | `new_message` |
| **Always sent** | `application_hired`, `hire_lapsed`, `hire_funded`, `funded_hire_cancelled`, `work_submitted`, `submission_denied`, `review_reminder`, `dispute_opened`, `dispute_statement`, `dispute_withdrawn`, `engagement_settled`, `payout_paid`, `payout_failed`, `payout_rejected`, `payment_stranded`, `campaign_taken_down`, `verification_approved`, `verification_rejected`, `profile_hidden`, `profile_restored`, `appeal_answered` |

Placement of the borderline kinds (`application_hired`, `work_started`,
`campaign_taken_down`, the verification and standing kinds) is my call; see
"Calls I made".

### Database (one migration)

- `notifications` gets `email_due_at timestamptz`, `emailed_at timestamptz`,
  `email_attempts int not null default 0`. Rows that exist at migration time
  keep `email_due_at` null, so nobody is emailed about old events.
- `notify()` sets `email_due_at`: `now()` for every kind, `now() + 15
  minutes` for `new_message`. On a bump of a grouped row (the existing
  `on conflict` path): if it has not been emailed yet, only refresh the due
  time for messages; if it was emailed 1 hour or more ago, clear `emailed_at`
  and attempts and set a new due time; if it was emailed less than an hour
  ago, change nothing. That is the one-email-per-thread-per-hour cap.
- `notification_preferences (user_id pk → users, email_applications,
  email_campaigns, email_messages, all boolean default true)`. No row means
  all on. RLS: a person reads and writes only their own row.
- `claim_due_emails(max int)` (service role only). Selects due, unsent,
  under-5-attempts rows with `for update skip locked`, adds 1 to attempts,
  pushes `email_due_at` out 5 minutes (so an overlapping run skips them and
  a failure retries with a delay), and returns each row with the recipient's
  `users.email` and `users.role` and their preferences. `mark_email_sent(id)`
  (service role only) sets `emailed_at`.
- Reading is unaffected: people keep reading only their own rows.

### When a send runs

One function, `sendDueEmails()` in `src/lib/send-emails.ts`, does all the
sending. It is called from four places:

1. **Right after a user action** that can notify someone: Server Actions
   call it inside Next's `after()`, so it runs once the response is sent and
   can neither slow nor fail the action.
2. **Right after a webhook** that moves money (card payment, transfer
   result), also in `after()`.
3. **At the end of each existing daily job** (expire-engagements,
   review-deadlines, money-checks), which covers lapses, auto-releases and
   review reminders.
4. **The backstop:** `/api/cron/send-emails`, called every minute by
   `pg_cron` (and daily by Vercel Cron as a second net). It sends chat
   emails once their 15 minutes pass and retries failures.

Because every caller drains the same queue and the claim step locks rows,
overlapping calls never send the same email twice.

### The send run (`sendDueEmails()`)

1. `claim_due_emails(15)`: the number is chosen so a run's worst case (15 sends at the 15 s Resend timeout, one at a time) stays under the 5-minute hide. (The route wrapper first does the bearer check
   with the existing `authorised()` helper and `CRON_SECRET`.)
3. For each row: look up its policy. Skip it, and clear its due time so it
   is not picked again (without counting it as sent, so a skipped email
   doesn't use up the one-per-hour cap), if its group is switched off, if it
   is a message and the thread was read in the meantime (`read_at` set), or
   if `describeNotification` returns null. Otherwise render and send.
4. Send with `lib/resend.ts` using an idempotency key built from the
   notification id and `occurred_at`, so a crash between Resend accepting and
   `mark_email_sent` does not double-send. On success `mark_email_sent`; on a
   Resend error leave the row (it is due again in 5 minutes, up to 5
   attempts, then `console.error` once and give up).
5. The route responds 500 if any send failed, like the other cron routes.

Preferences are read at send time, so switching a group off also stops
emails already waiting.

### The email itself (`src/lib/email-template.ts`)

One layout for every kind, built from `describeNotification(...)`:
subject = the title; body = the body line; one button "Open in Pitchype"
linking to the absolute URL (`NEXT_PUBLIC_APP_URL` + href); a plain-text
alternative; a footer: "You can change which emails you get in your account
settings", linking to `/account`. All text is HTML-escaped.

Look: the samples shared by the user were taken as inspiration only. Keep
their sound craft: a 600px table layout, Outlook-safe button, button that
stacks on phones, a white card on a soft background. Use Pitchype's tokens
(ink on porcelain, one violet button), a text wordmark (no header image),
no emoji, no side-stripe boxes, text that passes contrast. No raw ids in the
copy.

### Preferences page

A section "Emails" on `/account` with three switches and a line saying
money and deadline emails always send. A Server Action
(authenticate, validate three booleans, save through `lib/db/notifications.ts`).

### Scheduling and setup

- Built last, after the immediate sending works: a migration enables
  `pg_cron` and `pg_net` and schedules a per-minute `net.http_get` to
  `<app>/api/cron/send-emails` with the bearer secret. The URL and secret
  come from Supabase Vault, not the migration. The Vault entries are a
  manual step on each environment, listed in `docs/TODO.md`. Launch can
  happen before this is on.
- A partial index on `notifications (email_due_at)` where `emailed_at is
  null` keeps the per-minute check cheap.
- `vercel.json` adds a daily call to the send route as a second net.
- Locally nothing runs by itself; a script or `curl` calls the route.
- `.env.example` gains `RESEND_API_KEY` and `FROM_EMAIL`.
- `docs/PROVIDERS.md` gains Resend (transactional) and `pg_cron`/`pg_net`.

### Tests

- pgTAP: due times for message and non-message kinds; grouped-row bump and
  the one-per-hour cap; old rows not queued; `claim_due_emails` skips locked
  rows, respects the attempts cap and pushes the due time; grants (service
  role only); preferences RLS.
- Unit: a failing send inside `after()` never fails the action; policy
  table covers every kind; rendering and escaping; a run with a
  fake Resend (sent, skipped for preference, skipped for read thread, failure
  retried, idempotency key).
- A race scenario in `scripts/money-race.mjs`-style: two `claim_due_emails`
  calls at once return disjoint rows.

## Calls I made (change any)

- Borderline kinds: `application_hired` always (the creator is waiting for it
  and it leads to payment); `work_started` switchable; `campaign_taken_down`,
  verification results and standing changes always; the campaign group is
  therefore only approved and sent back.
- Retry up to 5 times with a 5-minute gap; one chat email per thread per
  hour.
- Preferences in their own table, not columns on `users`.
- Emails sent to `public.users.email`, the address the person signed up with.
- No `List-Unsubscribe` header at launch (the footer links to settings).

## Left to the builder

Exact wording of the settings section, the HTML details of the layout, the
shape of the Resend wrapper's errors, and how the setup steps read in
`docs/TODO.md`.
