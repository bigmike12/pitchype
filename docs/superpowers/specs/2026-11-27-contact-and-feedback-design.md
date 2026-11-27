# Contact page and feedback loop: design

Date: 2026-11-27. Branch `contact-and-feedback`, stacked on `redirect-old-site-pages` (PR #38).

## Why

1. Google still lists a "Contact Us" sitelink from the site that used this domain before. PR #38 sends `/contact` to the FAQ as a stopgap; the owner wants a real contact page that anyone, signed in or not, can use.
2. Businesses and creators have no way to tell us what they need. The owner wants feedback and feature requests from inside the product, and **people should hear back when what they asked for ships**. That is the loop: ask → we decide → they're told when it's live.

Success: a visitor can reach us from `/contact` without opening their mail app; a signed-in person can send a request in under a minute, see where it stands, and gets a notification and an email when it ships.

## Goals

- `/contact`: a public page with the contact email, our social profiles and a short form that emails the team inbox.
- `/feedback`: a portal page where businesses and creators send an idea or report a problem and see their own requests and statuses.
- `/admin/feedback`: an admin page to triage requests (status, note, duplicates).
- When a request ships, its sender (and the sender of every duplicate) gets a notification and an email.

## Non-goals

- A public board, votes, or comments on requests. Requests are **private** (owner's decision): each person sees only their own.
- Telling people about `planned` or `not planned` (owner's decision: hear back when it ships). The status is visible on their page; it just doesn't notify.
- Storing contact-form messages in the database (owner chose approach A: they go to the inbox).
- Attachments or screenshots on requests.
- A CAPTCHA or third-party feedback tool (Canny, Featurebase).

## Anti-goals

- A request's words ever shown to anyone but its sender and admins. Duplicates are merged without revealing who else asked or what they wrote.
- Spam reaching the inbox through the public form at volume.
- Someone told "it shipped" twice for the same request, or never told because their request was a duplicate.

## Approaches considered

- **A. Contact form emails the inbox; portal feedback in the database (chosen).** Contact replies happen in normal mail, where they belong for signed-out visitors. Feedback needs statuses and a "shipped" notice, so it needs the database.
- **B. One database inbox for both.** No dependence on the mailbox, but two places to read and reply, and more to build. Rejected: `hello@pitchype.com` is a real inbox the owner reads (confirmed 2026-11-27).
- **C. Contact page with details only, no form.** Least work, but barely better than today's footer. Rejected.
- Third-party feedback tools: a new dependency, user data elsewhere, and built around the public boards the owner ruled out.

## Part 1: `/contact`

**Page** (`src/app/(marketing)/contact/page.tsx`, marketing shell, triangle cursor like other marketing pages):
- Heading and one line on what to write to us about, the email as a `mailto:` link, the social profiles from `SOCIAL_PROFILES`, and a pointer to the FAQ.
- The form: name (1–80), email (valid address), topic (select: "A question", "Help with my account", "Partnerships or press"), message (10–2,000 characters). A hidden honeypot field (`company_website`, off-screen, `tabindex=-1`, `autocomplete=off`) and a per-render form id.
- Signed-in people get the same form (no prefill needed now). The page stays static apart from the form's server action, so it is not added to the proxy matcher.
- Metadata, canonical, sitemap entry and an `llms.txt` line like the other marketing pages. Footer gets a "Contact" link; the FAQ's "email us" line can stay.

**Server action** (`src/app/(marketing)/contact/actions.ts`): validate on the server → honeypot filled ⇒ answer success and send nothing → rate limit by client IP (`clientIp()`), 5 per hour, name `contact-form` → send.
- Sends with `sendEmail()` to `CONTACT_EMAIL`, subject `Contact: <topic> from <name>`, plain text and simple HTML via the existing email template, and **`replyTo` set to the sender's address**. `EmailMessage` gains an optional `replyTo`, passed to Resend as `reply_to`.
- Idempotency key `contact:<form id>`, so a double-click sends one email.
- Neutral success ("Thanks. We'll reply to <email>."); no response-time promise. On Resend failure: an error that offers the `mailto:` link. Never log the message body or the address (`safeMessage` already strips addresses).

**Redirects** (`next.config.ts`): drop `/contact`; `/contact-us` and `/contactus` now go to `/contact`. Services redirects unchanged.

`src/lib/site.ts`: drop the "placeholder" comment on `CONTACT_EMAIL`; the inbox is real.

## Part 2: feedback requests

### Data (one migration)

`feedback_requests`:
| column | notes |
|---|---|
| `id` uuid pk | |
| `number` bigint identity, unique | shown as `#42` to people and admins |
| `user_id` uuid → `users(id)` | sender; business or influencer role |
| `kind` text check in (`idea`, `problem`) | |
| `title` text, 3–120 chars | |
| `details` text, 10–2,000 chars | |
| `status` text check in (`received`, `planned`, `shipped`, `not_planned`), default `received` | |
| `admin_note` text, ≤ 1,000 chars, nullable | shown to the sender |
| `duplicate_of` uuid → `feedback_requests(id)`, nullable | |
| `shipped_at` timestamptz, nullable | set the first time it ships; guards the notice |
| `created_at`, `updated_at` timestamptz | |

Check: a row can't be its own duplicate.

**RLS:** enabled, default deny. A person selects their own rows; admins select all. No insert, update or delete grants to `anon` or `authenticated`; all writes go through the functions below (`security definer`, `search_path = ''`).

**Functions:**
- `submit_feedback(kind, title, details)`: caller must be signed in with role `business` or `influencer` (suspended accounts may still send). Trims and validates; returns the new row's id and number.
- `set_feedback_status(request_id, status, note)`: admin only. Locks the row. Refuses a row that is a duplicate (`is_duplicate`: change the main request instead). Sets status and note. If the new status is `shipped`, ships the row and every row with `duplicate_of = request_id` whose `shipped_at` is null (status `shipped`, `shipped_at = now()`), and notifies each of those senders once (`feedback_shipped`). Moving a shipped request back to another status is allowed and never un-notifies or re-notifies; `shipped_at` stays.
- `mark_feedback_duplicate(request_id, main_number)`: admin only. Main must exist, differ, and not itself be a duplicate (`main_is_duplicate`); the request being merged must have no duplicates of its own (`has_duplicates`). Sets `duplicate_of`. If the main is already shipped, ships the merged request immediately and notifies its sender. `unmark_feedback_duplicate(request_id)` clears it (admin only).
- Rows are never deleted.

A duplicate's own `status` is left as it was while merged; what the sender sees comes from the main request (below), and it becomes `shipped` when the main ships.

### Notification

Kind `feedback_shipped`, facts `{ number, title }` (the sender's own title, never the main request's). Words in `describeNotification`: "Something you asked for is live", body "#42 <title>" plus the admin note when there is one (the main request's note for a duplicate), linking to `/feedback`. `EMAIL_POLICY`: `always`, because the person asked to be told by sending the request and it's rare (my call; the alternative is the switchable `campaigns` group). Never sent to the admin who acted (they can't be the sender anyway).

### `/feedback` (portal, businesses and creators)

- Route `src/app/(portal)/feedback/` (shared by both roles, like `account`), added to the proxy's `SIGNED_IN_ONLY` and matcher. Admins visiting it are sent to `/admin/feedback`.
- Sidebar: a "Feedback" link in the same group as Account / help for businesses and creators.
- Top: the form (kind as two radio cards "Suggest an idea" / "Something's not working", title, details). Rate limit 10 per person per day (`feedback`). On success the form clears and the new request appears at the top of the list with "Received". No bell notification for one's own action.
- Below: their requests, newest first, paged with the existing paging helper. Each shows `#number`, title, kind, sent date, a status chip and the admin note. A merged duplicate shows the main request's status and note, plus "Others asked for this too". Empty state explains what happens next ("We read every request. When something you asked for ships, we'll tell you.").
- Skeleton loading state in the same change (CLAUDE.md §4a).

### `/admin/feedback`

- One page, filter tabs by status (Received default, Planned, Shipped, Not planned) and by kind; paged.
- Each card: `#number`, title, details, kind, sent date, the sender's name, role and email (so an admin can write to them), the current note, and a link to the main request if it's a duplicate, or "N duplicates" if it has some.
- Actions: set status with an optional note (one form); "Mark as duplicate of #…" (number input) and "Not a duplicate".
- Admin sidebar link and a count of `received` requests on the admin home's queue.

## Testing

- pgTAP `supabase/tests/feedback.test.sql`: RLS (sender sees only their own; another user sees nothing; admin sees all; no direct writes for any role); `submit_feedback` role and length checks; admin-only functions refuse non-admins; shipping notifies the sender and each duplicate once; shipping twice, or ship → planned → shipped, notifies no one again; merging into an already shipped request notifies at once; duplicate-chain refusals.
- Unit tests for the contact-form and feedback-form parsing/validation and for the `feedback_shipped` words.
- Exercise both pages and the admin page locally at 390px and desktop; send one contact email through Resend in the dev environment if the key is set, otherwise say it wasn't sent.

## Left to the builder

Exact copy, the select/radio styling within the design system, where the admin count sits on the admin home, file names inside the route folders, and the refusal words (via `src/lib/refusals.ts` like other refusal codes).
