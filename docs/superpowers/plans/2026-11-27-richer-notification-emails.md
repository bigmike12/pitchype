# Richer notification emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every notification email its own fuller, warmer copy with a greeting by name, while the bell keeps its short words.

**Architecture:** A new pure module `src/lib/notification-email-copy.ts` turns a notification into an `EmailCopy` (subject, preview, paragraphs, next steps, button label). `renderEmail` lays it out with a greeting and an honest footer. `claim_due_emails()` returns the recipient's name.

**Tech Stack:** Next.js, TypeScript, node:test, Supabase Postgres (pgTAP).

**Spec:** `docs/superpowers/specs/2026-11-27-richer-notification-emails-design.md`

## Global Constraints

- No new dependency; hand-written HTML stays.
- Bell copy (`describeNotification`) is unchanged.
- Never claim an amount the notification data doesn't carry; never tie a missed checkpoint to money; never say why an identity check needs review.
- No Nigeria-only wording.
- Every interpolated value is HTML-escaped in the HTML part.

## Review Focus

- A notification with empty `data` (old rows, missing facts) must still render a sensible email for every kind.
- A recipient with no profile row (name null) greets "Hi there".
- Admin notes and creator names with `<`, `&`, quotes are escaped in every new field (paragraphs, next steps, subject stays plain text).
- Code deployed before the migration (no `name` column in the RPC result) still sends.
- An unknown kind still falls back to `null` and is skipped, as today.

---

### Task 1: Recipient name in the email queue

**Files:**
- Create: `supabase/migrations/20261203100000_email_recipient_name.sql`
- Modify: `src/lib/db/notification-emails.ts` (DueEmail gets `name: string | null`)
- Modify: `src/types/database.ts` (claim_due_emails Returns gets `name: string`)
- Test: `supabase/tests/email_queue.test.sql` (add: the claim returns the business contact name and the creator display name)

- [ ] Drop and recreate `public.claim_due_emails(integer)` with the same body plus `name text` as the last column: `case u.role when 'business' then bp.contact_name when 'influencer' then ip.display_name end`, left joining both profile tables. Re-issue the revoke/grant (service_role only).
- [ ] `claimDueEmails` maps `name: typeof r.name === "string" && r.name.trim() !== "" ? r.name : null` (tolerates the column being absent).
- [ ] Run pgTAP on a throwaway instance; expect the new assertions to pass.
- [ ] Commit.

### Task 2: Email copy per kind

**Files:**
- Create: `src/lib/notification-email-copy.ts`
- Test: `src/lib/notification-email-copy.test.ts`
- Modify: `src/lib/notifications.ts` (export `settlementBody`, `denialReasons`, `payoutSentBody`, `kobo` helpers it already has, as needed)

**Interfaces:**
- Produces:
  ```ts
  export type EmailCopy = {
    subject: string;
    preview: string;
    heading: string;
    paragraphs: string[];       // 1–3
    nextSteps: string[];        // may be empty
    quote: { label: string; text: string } | null; // an admin note or a message preview
    button: string;             // e.g. "Review applicants"
    href: string;
  };
  export function describeEmail(n: NotificationRow, role: "business" | "influencer"): EmailCopy | null;
  ```
- `href` always equals `describeNotification(n, role).href`; `null` exactly when `describeNotification` is null.

- [ ] Tests: every kind in `EMAIL_POLICY` returns copy for both roles with empty data and with typical data; `href` matches the bell; button is never "Open in Pitchype"; `application_hired` mentions 48 hours and not starting before payment; `dispute_opened` mentions 3 days and an admin; checkpoint kinds never say money is held (assert the text has "No money is held back" or no money words); `identity_needs_review` doesn't contain "match"; `engagement_settled` for a creator includes the net and fee when present.
- [ ] Implement, one `case` per kind, tone per the spec.
- [ ] Run `node --test src/lib/notification-email-copy.test.ts`; expect pass.
- [ ] Commit.

### Task 3: Layout, greeting, footer, wiring

**Files:**
- Modify: `src/lib/email-template.ts` (`renderEmail(copy: EmailCopy, opts: { siteUrl: string; name: string | null; role: "business" | "influencer"; switchable: boolean })`)
- Modify: `src/lib/send-emails.ts` (use `describeEmail`, pass name and `EMAIL_POLICY[kind] !== "always"`)
- Test: `src/lib/email-template.test.ts`, `src/lib/send-emails.test.ts`

- [ ] Footer also lists Pitchype's socials from `SOCIAL_PROFILES` in `src/lib/site.ts` (text links, no icon images) and the contact address `CONTACT_EMAIL` (owner asked 2026-11-27).
- [ ] Tests: greeting "Hi Ada," from contact name "Ada Obi" for a business; full display name for a creator; "Hi there," for null; switchable footer keeps the settings sentence; `always` footer says it can't be switched off and still links settings; next steps render as a list in HTML and "- " lines in text; quote is escaped; sign-off "The Pitchype team".
- [ ] Implement.
- [ ] Run all `src/lib/*.test.ts`, `npm run lint`, `npx tsc --noEmit`; expect pass.
- [ ] Render one sample of each kind to the scratchpad and eyeball them in a browser.
- [ ] Update CLAUDE.md §8 (email copy lives in `notification-email-copy.ts`) and commit.
