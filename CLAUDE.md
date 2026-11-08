# CLAUDE.md — Pitchype

Guidance for Claude (and any engineer) working in this repository. Read it fully before making changes. When this file and the code disagree, say so and ask; don't silently pick one.

---

## 1. What Pitchype is

Pitchype is a two-sided marketplace, closer to Fiverr/Upwork than to a traditional influencer agency, connecting **businesses** with **micro and nano influencers** (primarily Nigeria/Africa first, Paystack-based payments).

Two ways work gets started:

1. **Campaign-led (influencers come to the work).** A business creates and publishes a campaign. Influencers browse and filter listed campaigns and apply to the ones they fit and qualify for.
2. **Influencer-led (business goes to the talent).** A business browses and filters the influencer pool, opens a chat, negotiates, and hires directly.

Both paths converge on the same thing: an **engagement** (one influencer doing one job for one business), protected by escrow.

### Core lifecycle (the happy path)

```
Business creates campaign → publishes (listed)
  → Influencer applies (optionally proposing a price)
  → Business is notified of the application
  → Business reviews, chats/negotiates if needed, approves N influencers (N = slots needed)
  → Business pays the agreed price (campaign default OR negotiated) → funds held in ESCROW
  → Influencer does the work
  → Influencer submits completion (with proof) → Business is notified
  → Business reviews the submission:
        ACCEPT → escrow released to influencer wallet (minus platform fee)
        DENY   → must give reason(s); influencer may resubmit or dispute
        NO RESPONSE for 7 days → AUTO-RELEASE escrow to influencer
  → Influencer requests payout from wallet → bank transfer
```

### Product principles (these shape code decisions)

- **Money safety is the product.** Businesses trust us because escrow is real; influencers trust us because auto-release is real. A bug in money flow is a Sev-1, always.
- **Both sides must win.** Don't add features that make one side's economics worse without a matching benefit to the other.
- **Fairness over cleverness in ranking.** Paid placement must always be visibly labelled (see §10).

---

## 2. Engineering philosophy (non-negotiable)

Simplicity, readability and maintainability take priority over abstraction and architectural sophistication. These rules apply to all new development and every refactor.

- **Build for today's requirements.** Solve the problem in front of you. Don't add speculative extension points, configuration options or generic frameworks for needs that don't exist yet.
- **Prefer the straightforward implementation.** Choose plain functions, direct data flow and explicit code over clever patterns, indirection or layers of wrappers.
- **Abstract only when it earns its place.** Extract shared code when there is real, repeated duplication (usually three or more uses) or a clear boundary that makes callers simpler. A little repetition costs less than the wrong abstraction.
- **Avoid new dependencies by default.** Use the platform, the framework and the libraries already in the project first. Add a package only when it replaces substantial, non-trivial code and is actively maintained.
- **Don't refactor to reduce line count.** The goal is clearer code, not shorter code. Don't collapse readable code into dense one-liners, long chains or premature helpers.
- **Preserve what works.** Keep existing abstractions that are useful and in use, and keep existing behaviour intact. A refactor must not drop functionality, edge-case handling or tests.
- **Justify complexity before adding it.** Before introducing a layer, pattern, dependency or generalisation, name the concrete problem it solves today and confirm that the benefit outweighs the cost of reading, testing and maintaining it. If you can't, leave it out.

### How this applies here, concretely

- No repository/service/factory/DI layers "for flexibility". A Server Action or route handler that calls Supabase directly is fine.
- **One payment provider (Paystack).** Do not build a multi-processor abstraction. If a second provider is ever needed, introduce the seam then.
- **No state library by default.** Server Components + URL search params + local `useState` cover most needs. Add Zustand only if a specific piece of cross-component client state can't be handled otherwise, and say which one.
- **No Socket.io.** Supabase Realtime covers chat and live notifications.
- Prefer a `switch`/lookup object over a state-machine library for the status flows in §5.
- Don't add feature flags, plugin systems, or generic "providers" until a second real use exists.

### Where complexity IS justified (don't "simplify" these away)

Money handling, escrow state transitions, webhook idempotency, RLS policies and auto-release are deliberately explicit and defensive. Extra checks, transactions and tests here are not over-engineering. Simplicity means *clear*, not *unguarded*.

---

## 3. Tech stack (current defaults)

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) |
| Backend | Server Actions and Route Handlers in the Next app |
| Database / Auth / Storage / Realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| Authorization | Postgres Row Level Security (RLS) + role checks server-side |
| Styling / UI | Tailwind CSS + shadcn/ui |
| Payments | Paystack (charges, webhooks, transfers for payouts) |
| Email | Resend (transactional) |
| Deploy | Vercel (+ Vercel Cron or Supabase `pg_cron` for scheduled jobs) |

If you are about to use something not in this table, apply §2 first and tell the user.

### Known inconsistencies in the old README (do not copy them forward)

- Used `VITE_*` env vars in a Next.js app. Use `NEXT_PUBLIC_*` for browser-exposed values only.
- Listed both NotificationAPI and Resend for email. **Pick Resend** unless told otherwise.
- Listed Socket.io alongside Supabase Realtime. Use Realtime only.
- Listed "multi-processor payments". Paystack only.
- Marketing stats (50K creators, 300% ROI) were placeholders. **Never ship unverified statistics** in UI or copy.

---

## 4. Repository layout

Start small and let structure grow with real need. Suggested starting shape:

```
src/
  app/
    (marketing)/           public pages, influencer directory (SEO)
    (auth)/                login, signup, onboarding
    (business)/            campaigns, applications, hires, payments, inbox
    (influencer)/          browse campaigns, applications, jobs, wallet, inbox
    (admin)/               disputes, payouts, moderation
    api/webhooks/paystack/ webhook endpoint
  components/
    ui/                    shadcn primitives
    <feature>/             campaign, application, escrow, chat, wallet…
  lib/
    supabase/              server, browser, and admin clients
    money.ts               formatting + integer math (see §6)
    escrow.ts              state transitions for money (see §6)
    paystack.ts            thin fetch wrapper for the endpoints we use
  types/                   generated DB types + hand-written domain types
supabase/
  migrations/              timestamped SQL, the source of truth for schema
  seed.sql
```

Co-locate code with the feature that uses it. Don't create `utils/` dumping grounds; a helper used in one place lives next to that place.

---

## 5. Domain model & state machines

Every status below is a Postgres enum or check-constrained text column. **Transitions are validated server-side in one place per entity**, never trusted from the client.

### Roles
`business`, `influencer`, `admin`. A user has exactly one role (decide before building if a person can be both; if yes, model it as two profiles, not one tangled profile).

### Campaign
`draft → open → in_progress → completed`; also `closed` (stopped accepting applications) and `cancelled`.
- Fields to capture at creation: title, brief, deliverables, platforms, niche/category, location, follower/engagement criteria, default price per influencer, slots needed, application deadline, deliver-by date.
- A campaign is listed to influencers only while `open` and not past deadline and slots not all filled.
- Slots filled = number of `approved`/`active` engagements. Enforce in the database (constraint or transaction), not only in the UI. Two business clicks must never over-fill slots.

### Application
`submitted → shortlisted? → approved | rejected | withdrawn`
- Application stores the influencer's proposed price (nullable; null = accepts campaign default).
- **Eligibility is checked server-side at apply time** against the campaign criteria (min followers, niche, location, platform). The UI should show *why* someone is ineligible rather than hiding the campaign.
- One application per influencer per campaign (unique constraint).

### Engagement (the unit that carries money)
Created when a business approves an application. Holds the **agreed price** (campaign default or negotiated; frozen at funding time).

`awaiting_payment → funded → in_progress → submitted → accepted | denied → (resubmitted → …) → paid_out`
plus `disputed`, `auto_released`, `cancelled`, `refunded`.

- An influencer must **not** start work until the engagement is `funded`.
- **"Work started" = the influencer clicks "Start work" on a `funded` engagement** (`funded → in_progress`). Show a clear confirmation before they click. This moment decides who can cancel alone (see §6.2).
- If a business doesn't fund within X days of approval, the approval expires (value of X: open decision, §12).

### Submission
Proof of work: links, screenshots, files, notes. `pending_review → accepted | denied | auto_accepted`.
- Denial **requires** one or more reasons (non-empty, stored, shown to the influencer).
- After denial the influencer can resubmit (limit the number of rounds; open decision) or open a dispute.

### Escrow & wallet
See §6. This is the critical section.

---

## 6. Money rules (read before touching anything financial)

1. **Integer minor units only.** Store amounts as `bigint` kobo (or the currency's minor unit) with a `currency` column. **Never** use floats for money. Format only at the edge, via `lib/money.ts`.
2. **Append-only ledger.** Every movement of money writes a row to a `ledger_entries` (a.k.a. wallet transactions) table: who, engagement, type, amount, direction, reference, created_at. Balances are derived from the ledger (or cached and reconciled against it). Never `UPDATE` or `DELETE` ledger rows; correct mistakes with a reversing entry.
3. **Escrow is a ledger concept.** Paystack does not hold escrow for us. When a business pays, funds land in our Paystack balance; the ledger records them as *held for engagement X*. Our database is the source of truth for who is owed what. Reconcile ledger totals against the Paystack balance regularly.
4. **Release is atomic.** Releasing escrow (accept, auto-release, or admin resolution) must, in one DB transaction: verify the engagement is in a releasable state, compute fee and net, write ledger entries, move the engagement status, and only then enqueue notifications. A second release attempt must be a no-op, not a double payment.
5. **Webhooks are idempotent.** Verify `x-paystack-signature` (HMAC SHA512 of the raw body with the secret key) **before** parsing. Store each processed event/reference and ignore duplicates. Webhooks can arrive late, twice, or out of order.
6. **Never trust the client for amounts.** Price comes from the engagement row on the server. After a redirect/callback, **verify the transaction with Paystack server-side** before marking anything funded.
7. **Platform fee is data, not a constant.** Read fee rules from a `fee_config` table/row, snapshot the fee applied onto the engagement at funding time so later config changes don't rewrite history. The decided fee and refund policy is in §6.1–6.3.
8. **Payouts:** influencer requests a payout from wallet → we create a payout record (`requested → processing → paid | failed`) → Paystack Transfer. Enforce a minimum payout, verify bank account name resolution, and re-credit the wallet via a ledger entry if a transfer fails. **The influencer pays the transfer fee** (see §6.1); show the exact amount they will receive *before* they confirm the payout.
9. **Auto-release (7 days):**
   - Clock starts when the submission reaches `pending_review`. Store `review_deadline_at` on the submission; don't recompute it from "now".
   - A scheduled job selects engagements past the deadline that are still `submitted` and releases them via the same function as manual acceptance (rule 4).
   - Send reminders to the business before the deadline (e.g. day 3 and day 6; adjust freely).
   - If the business denies or opens a dispute before the deadline, the clock stops. A resubmission restarts it.
   - The job must be idempotent and safe to run twice or late.
10. **Test money paths with real assertions:** double-submit, double-webhook, concurrent accept + auto-release, partial failures, rounding on fee math.

### 6.1 Fees (decided)

- **Business fee: 5% of the agreed price, charged ON TOP.** The agreed price is what the influencer sees; the business pays price + fee. Example for a ₦50,000 job: business pays ₦52,500; ₦50,000 goes into escrow; ₦2,500 is recorded as platform revenue at funding time.
- **Influencer fee: 5% of the amount released to them**, deducted at release. ₦50,000 released → ₦2,500 fee → ₦47,500 to the influencer wallet. If only part of escrow is released (split dispute), the fee applies only to the part released.
- **Minimum fee ₦500 per side.** Keeps tiny jobs from costing us money.
- **Payout (transfer) fee is paid by the influencer**, passed through at cost (Paystack transfer fee + VAT + stamp duty). Show it when they request a payout. It is not a platform cost.
- **Invariant: the business fee must always exceed the Paystack charge on the business payment.** Paystack charges 1.5% + ₦100 (plus VAT, capped at ₦2,000 before VAT) on the full amount the business pays, and does **not** refund that charge on refunds. Because the business fee is always larger, keeping it means a paid engagement never loses money. Write a test that fails if `fee_config` ever breaks this.
- All numbers above live in `fee_config` and are snapshotted per engagement (rule 7).

### 6.2 Cancellations and refunds (decided)

Refunds go to the **business wallet** by default (instant, no Paystack refund delay). The business can also ask to withdraw wallet balance to its original payment method; that is a Paystack refund and takes days. There is **no fee credit**: wallet balance is plain money.

| Situation | Business gets back | Platform keeps |
|---|---|---|
| Business cancels after paying, work **not** started | agreed price (₦50,000) | business fee (₦2,500) |
| Business wants to cancel after work **started** | only by influencer agreement, or via dispute (no unilateral cancel) | business fee |
| Influencer withdraws, ghosts, or admin finds influencer at fault | agreed price **plus** business fee minus the Paystack charge on the payment (e.g. ₦50,000 + ₦1,546) | nothing (break-even) |
| Dispute, admin releases in full to influencer | nothing | both fees (normal completion) |
| Dispute, admin refunds in full to business (influencer not at fault) | agreed price | business fee |
| Dispute, split (e.g. 50/50) | refunded share of the price | business fee + influencer fee on the released share |

Rules:
- The business is told about the non-refundable fee **at checkout before paying** and again **on the cancel screen**. Store that they saw it.
- No grace period at launch (it would cost the Paystack charge each time).
- Flag and limit accounts with repeated cancellations or refunds.
- Admin resolution outcomes are: full release, full refund, or a split by amount. Every outcome writes ledger entries via the same atomic function as normal release (rule 4).

### 6.3 Business wallet

- A separate ledger account from escrow and from influencer wallets. At any time: business wallets + escrow + influencer wallets must be fully covered by the Paystack balance. Reconcile regularly.
- Funding an engagement uses wallet balance first and Paystack for any remainder. The Paystack charge applies only to the remainder.
- **Do not build wallet top-ups yet.** The wallet fills only from refunds until a real need appears.

### 6.4 Expected profit per ₦50,000 job (before support costs)

Completed or auto-released ₦4,046 · business cancels ₦1,546 · business wins dispute ₦1,546 · split ₦2,796 · influencer at fault ₦0. Never negative on the payment itself. These figures assume Paystack's published rates plus 7.5% VAT on its fees; the support-cost reserve used in planning (about ₦750 per job) is an unmeasured assumption, so replace it with real dispute data after the pilot. Card chargebacks raised through a business's bank (Paystack charges ₦2,500 each) fall outside our dispute process and are the one way a payment can still lose money.

> **Compliance flag (raise with the user, don't decide alone):** holding third-party funds and paying them out may carry regulatory implications in Nigeria (e.g. CBN/PSP rules). Confirm with a lawyer/Paystack how escrow-style flows should be structured before launch. Do not make legal claims in the product copy.

---

## 7. Security & data access

- **RLS on every table, from the first migration.** Default deny. Write policies for each role explicitly (business sees own campaigns/applications on them; influencer sees own applications/engagements; admin via a separate controlled path).
- The **service-role key is server-only.** Never import the admin Supabase client into anything that can reach the browser. Keep it in one file (`lib/supabase/admin.ts`) so it's greppable.
- Validate all inputs on the server (Zod is acceptable if already in the project; otherwise plain checks). Don't rely on client-side validation.
- Server Actions and route handlers always: authenticate → authorize (role + ownership) → validate → act.
- File uploads: private buckets by default, signed URLs, size and type limits.
- Chat: users can only read threads they belong to. **Discourage and, where possible, detect off-platform payment solicitation** (bypassing escrow is the biggest leakage risk for marketplaces); see §10.
- Rate-limit auth, application submission, messaging and payout requests.
- Never log secrets, full tokens, or full bank details. Mask account numbers in logs and UI.
- Secrets live in env vars only. `.env*` is git-ignored; keep `.env.example` current with names (not values).

---

## 8. Notifications

Notification events (each = in-app via Supabase Realtime + email via Resend, unless noted):

- Business: new application, influencer submitted completion, review deadline approaching, auto-release occurred, new message.
- Influencer: application approved/rejected, engagement funded, submission accepted/denied (with reasons), auto-release triggered, payout status, new message, new matching campaign (digest/alert; see §10).

Rules: one `notifications` table is the source of truth; email is a delivery channel off it, not a parallel system. Emails are transactional templates in code; keep them plain and testable. Respect user notification preferences, except for money-critical messages which always send.

---

## 9. Development workflow

### Before coding
1. Read the relevant section(s) of this file and the code around the change.
2. For anything touching money, state transitions or RLS: write down the invariants being protected, in a comment or PR description.
3. If a requirement is ambiguous in a way that changes behaviour, ask. If it only changes naming or layout, pick the simplest option and mention it.

### While coding
- Small, focused changes. One concern per PR/commit.
- TypeScript strict; no `any` without a comment explaining why. Prefer generated Supabase types over hand-written DB types.
- Schema changes **only** through new migration files in `supabase/migrations/`. Never edit an applied migration; never change schema by clicking in the dashboard without capturing a migration.
- Name things after the domain (`campaign`, `application`, `engagement`, `submission`, `payout`), not after patterns.
- Comments explain *why*, not *what*. Delete commented-out code.
- Keep components small, but don't split a component just to hit a line count (§2).
- Accessibility basics: labels, focus states, keyboard navigation, sufficient contrast. This audience is mobile-first: **design for small screens and slow networks first**.

### Testing
- Unit-test pure logic: fee math, eligibility checks, status transitions, deadline calculations.
- Integration-test the money paths against a local Supabase (webhook → funded → accept → wallet credit → payout), including the failure and duplicate cases from §6.
- Add a regression test with every bug fix.
- Don't chase coverage percentages; cover what would hurt if it broke.

### Before declaring a task done
- `npm run lint`, type-check, and tests pass.
- Migrations apply cleanly from scratch (`supabase db reset`).
- You exercised the changed flow (or say clearly that you couldn't).
- No stray `console.log`, TODOs without owner/context, or unused code you introduced.

### Commits & PRs
- Imperative, specific messages (`Release escrow atomically on accept`), not `fixes`.
- PR description: what changed, why, how it was tested, and any money/RLS/migration risk.

---

## 10. Business model notes that affect code

The user's revenue ideas are still being designed; these are the ones the codebase should be ready for. Don't build any until asked, and keep each simple.

- **Platform fee** (core revenue): 5% from each side, business on top, influencer deducted at release. Decided; see §6.1. Stored in `fee_config`, snapshotted per engagement. Launch at roughly 10% total and only raise it once repeat usage proves people stay on the platform.
- **Paid influencer visibility** (featured / boosted ranking): must be **explicitly labelled** ("Featured") and capped (e.g. limited featured slots per category) so paid placement can't bury quality. Never let payment silently override relevance.
- **Paid campaign-alert emails for influencers:** alerts match on stored preferences (niche, platform, min budget, location). Needs a subscription/entitlement check, and a digest/rate cap to avoid spam.
- **Anti-leakage:** the main threat to marketplace revenue is parties taking the deal off-platform. Product should make staying on-platform the better deal (escrow protection, dispute help, reputation, wallet), not just forbid leaving.

Entitlements (who has paid for what) live in one `subscriptions`/`entitlements` table checked in one helper. Don't scatter plan checks through the codebase.

---

## 11. Troubleshooting playbook

**General approach:** reproduce → find the smallest failing case → read the actual error/log → form one hypothesis → verify → fix the cause, not the symptom → add a regression test. Don't change several things at once.

| Symptom | Check first |
|---|---|
| Query returns empty / "no rows" for a user who should see data | **RLS.** Test the query with that user's JWT, not the service role. Check the policy for the exact role and ownership column. |
| Works with service role, fails in app | Almost always RLS or using the wrong Supabase client (browser vs server vs admin). |
| User logged out unexpectedly / session missing on server | Cookie handling in the Supabase server client, middleware refreshing the session, mismatched `NEXT_PUBLIC_SUPABASE_URL`/anon key between environments. |
| Paystack payment succeeded but engagement not `funded` | Webhook delivery (Paystack dashboard → logs), signature verification failing (raw body vs parsed body), idempotency table rejecting a reference, wrong webhook URL/secret for the environment. Verify via Paystack's verify-transaction endpoint and reconcile. |
| Duplicate credits / double release | Missing transaction or missing status guard in the release function; webhook processed twice; auto-release job and manual accept racing. Use row locks (`select … for update`) and status checks. |
| Auto-release didn't fire | Cron not running in this environment, job query filtering wrong status, `review_deadline_at` null or in wrong timezone (store UTC `timestamptz`). Check job logs first. |
| Payout stuck in `processing` | Paystack transfer webhook missed; transfer needs OTP/approval setting; insufficient Paystack balance. Check transfer status via API. |
| Realtime not updating | Table not in the Realtime publication, RLS blocking the subscription, channel not unsubscribed/duplicated on re-render. |
| Hydration mismatch / date shown differently | Formatting dates/currency differently on server vs client. Use a fixed locale and timezone strategy (store UTC, display in user's zone on the client). |
| Slow campaign browsing | Missing indexes on filter columns (status, niche, platform, price, created_at), unbounded list queries, N+1 in components. Add pagination first, then indexes, check `explain analyze`. |
| Type errors after schema change | Regenerate Supabase types; confirm the migration actually applied locally. |
| Email not arriving | Resend domain verification (SPF/DKIM), from-address, spam folder, sandbox vs production key. |

**Debugging etiquette:** reproduce locally against local Supabase before touching production. Never "fix" production data by hand without a written record of what was changed and why. Money discrepancies get a ledger-based explanation or a reversing entry, never a silent edit.

---

## 12. Open decisions (do not decide silently; ask the user)

Decided (see §6): fee split and structure, cancellation and refund rules, business wallet, payout fee paid by the influencer, definition of "work started".

Still open:
1. Can one account be both a business and an influencer?
2. Deadline to fund after approval before the approval expires.
3. Maximum resubmission rounds after a denial, and the dispute process (who arbitrates, timelines, how an admin decides "influencer at fault").
4. Minimum payout amount and payout schedule.
5. Whether negotiated prices can be changed after funding (default: no; cancel per §6.2, then re-engage).
6. Influencer verification: what proves follower counts and account ownership (OAuth with platforms vs manual proof vs screenshots), and whether metrics are self-reported at launch.
7. Launch markets/currencies (NGN first? others later?).
8. Legal/regulatory structure for holding funds in escrow and in business wallets (see §6 flag).
9. Whether businesses can withdraw wallet balance to their bank (recommended: yes, on request).

---

## 13. Working agreement with Claude

- Show the plan briefly for non-trivial work; then build it. Don't over-explain trivial changes.
- Match the existing code style; don't reformat unrelated files.
- If you notice a bug or risk outside the task, report it; don't fix it unasked unless it's a one-line obvious fix, and say so.
- Say what you verified and what you didn't. Never claim a flow works if you didn't run it.
- When unsure whether something is over-engineering, it probably is: choose the simpler version and mention the trade-off.
