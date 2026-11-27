# Richer notification emails (short design)

Decided with the owner on 2026-11-27.

## Why

Every notification email reuses the bell's one-line title and body (`describeNotification`), so an
email is a heading, at most one sentence and a generic "Open in Pitchype" button. Nine kinds have no
body at all. People get no greeting, no "what happens next", and no deadlines or rules that matter
(48 hours to pay, 3 days to answer a dispute, don't start before payment). The owner wants fuller
emails, fun but professional.

## Goals

- Each emailed kind gets its own email copy: subject, preview text, a greeting by name, 1–3 short
  paragraphs, an optional "What happens next" list, a button label naming the action, and a sign-off.
- Tone: upbeat on good news (hired, paid, payout sent, campaign live, verified); plain and calm on bad
  news (denials, disputes, takedowns, failed or rejected payouts, identity failed). Never jokey about
  money or enforcement.
- Greet by name: businesses by the first word of `business_profiles.contact_name`, creators by
  `influencer_profiles.display_name`; "Hi there" when there is none.
- The footer tells the truth: kinds marked `always` say the email can't be switched off because it is
  about money, deadlines or the account; switchable kinds point at the settings as today.

## Non-goals

- The bell's words do not change.
- No new notification facts, triggers or kinds; email copy uses the facts the notification already
  carries.
- No email library or new dependency; the template stays hand-written HTML.
- No marketing emails, no images beyond the existing header.

## Anti-goals

- Copy that claims something the data can't back (amounts we don't have, invented stats, legal claims).
- A missed checkpoint worded as costing money (CLAUDE.md §5).
- "Match found" or anything that reveals why an identity check needs review.
- Nigeria-only wording (copy was made market-neutral in #40).

## Approaches

1. **A separate email copy layer (chosen).** `describeEmail(notification, role)` in a new
   `src/lib/notification-email-copy.ts` returns a structured email; `renderEmail` lays it out. Kinds
   without email copy fall back to the bell's words. The bell stays short.
2. Lengthen `describeNotification` bodies. Rejected: bloats the bell, and one string can't hold lists,
   greetings or button labels.
3. React Email or MJML. Rejected: a new dependency for a template we already have (CLAUDE.md §2).

## How

- `claim_due_emails()` gains a `name` column (new migration; drop and recreate because the return type
  changes; grants kept: service role only). `DueEmail` gets `name: string | null`. The code reads it
  defensively, so code deployed before the migration greets "Hi there".
- `describeEmail` reuses `describeNotification` for the link (one source of truth for where each kind
  leads) and the shared helpers (settlement, denial and payout lines).
- `renderEmail` takes the structured email plus the recipient's first name and whether the kind is
  switchable. Escaping, the header image, the Outlook button and the plain-text part stay.
- Tests: every kind in `EMAIL_POLICY` has email copy; greeting and fallback; footer wording by policy;
  escaping of names, titles and admin notes in every new field; spot checks of key money lines.

## Left to the builder

Exact words per kind, within the tone rules above.
