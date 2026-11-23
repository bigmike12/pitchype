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

- No repository/service/factory/DI layers or interfaces "for flexibility". **Database access goes through plain functions in `lib/db/<domain>.ts`** (one file per domain; the only code that queries the database). Server Actions and route handlers call those functions, not the Supabase SDK. This is the one seam §2a needs, not a layer to grow.
- **One payment provider (Paystack).** Do not build a multi-processor abstraction. If a second provider is ever needed, introduce the seam then.
- **No state library by default.** Server Components + URL search params + local `useState` cover most needs. Add Zustand only if a specific piece of cross-component client state can't be handled otherwise, and say which one.
- **No Socket.io.** Supabase Realtime covers chat and live notifications.
- Prefer a `switch`/lookup object over a state-machine library for the status flows in §5.
- Don't add feature flags, plugin systems, or generic "providers" until a second real use exists.

### Where complexity IS justified (don't "simplify" these away)

Money handling, escrow state transitions, webhook idempotency, RLS policies and auto-release are deliberately explicit and defensive. Extra checks, transactions and tests here are not over-engineering. Simplicity means *clear*, not *unguarded*.

### 2a. Infrastructure portability (non-negotiable)

Start with Vercel and Supabase for speed, but keep the app movable to Docker or plain Node, self-hosted Postgres and another auth provider without a rewrite. Ship a maintainable product first; don't engineer for hypothetical scale.

- **Modular monolith.** One Next.js app. Business logic, data access, authentication, authorization and infrastructure live in separate modules. No microservices.
- **Business logic is provider-free.** Validation, domain rules and authorization decisions live in app code and never import a provider SDK. Provider SDKs are confined to boundary modules: `lib/db/*` (database), `lib/supabase/*` (clients), `lib/auth.ts` (from Stage 2), `lib/paystack.ts`, and the same for storage, email and jobs when they arrive.
- **Database portability.** Standard Postgres; every schema change is a version-controlled SQL migration. Keep business data out of Supabase-managed schemas (`auth`, `storage`) and avoid proprietary database features unless the benefit is named.
- **App-owned identities.** Use Supabase Auth, but business tables reference our own `users` table and id; the provider's user id is a separate column. Never build custom auth.
- **Deployment portability.** The app must run with `next build && next start` on any Node host (and in Docker). Configuration comes from environment variables. Scheduled jobs are plain route handlers or functions; Vercel Cron or `pg_cron` only triggers them.
- **Data ownership.** Schema, migrations, data and files must be exportable and restorable on independent infrastructure.
- **Document the seams.** `docs/PROVIDERS.md` lists every provider-specific dependency and how to replace it. Update it in the same change that adds or removes one.
- **Every abstraction earns its place.** A boundary module exists because replacing that provider is realistic. It is a set of plain functions, not an interface hierarchy; §2's simplicity rules still apply.

---

## 3. Tech stack (current defaults)

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) |
| Backend | Server Actions and Route Handlers in the Next app |
| Database / Auth / Storage / Realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| Authorization | Postgres Row Level Security (RLS) + role checks server-side |
| Styling / UI | Tailwind CSS v4 + shadcn/ui (Radix primitives through `radix-ui`, set up in `components.json`), restyled to our tokens; Lucide icons; CSS-only motion (see §4a) |
| Payments | Paystack (charges, webhooks, transfers for payouts) |
| Email | Resend (transactional) |
| Deploy | Vercel, Frankfurt region next to the database; must also run on plain Node/Docker (§2a). Vercel Cron or Supabase `pg_cron` triggers scheduled jobs |

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
    (auth)/                login, signup, password reset (signed out)
    (onboarding)/          step-by-step profile setup (signed in, own shell)
    (portal)/              every signed-in page; its layout draws the sidebar shell once
      home/, account/      role home page, settings (any role)
      (business)/          campaigns, find creators, applications, hires, payments, inbox
      (influencer)/        browse campaigns, profile, applications, jobs, wallet, inbox
      (admin)/             one page per job: standing, campaign review, verification, reports, hidden profiles; money (escrow, payouts, ledger, reconciliation)
    auth/                  route handlers for emailed links
    api/webhooks/paystack/ webhook endpoint (thin adapter; the decisions are in lib/payments.ts)
    api/cron/              scheduled jobs: expire-engagements, review-deadlines, settle-clicks, money-checks, send-emails (bearer CRON_SECRET)
  components/
    ui/                    design-system components (Button, fields, …; shadcn/ui-based where a primitive is needed); see docs/DESIGN_SYSTEM.md
    brand/                 wordmark, product fragments, stickers, illustrations
    shells/                page layouts (auth, onboarding, portal)
    <feature>/             campaign, application, escrow, chat, wallet…
  lib/
    db/                    data access, one file per domain; the only code that queries the database (§2a)
    supabase/              server, browser, and admin clients
    auth.ts                auth boundary (from Stage 2; §2a)
    money.ts               formatting + integer math (see §6)
    fees.ts                fee, Paystack-charge and transfer-fee maths; mirrors the fee_config seed (§6.1)
    paystack.ts            thin fetch wrapper for the endpoints we use; the only file that calls Paystack
    payments.ts            what a verified Paystack answer means: funding, stranding, payout results, webhook decisions (§6.6)
    money-checks.ts        the daily job: settle stuck payouts, record a reconciliation run
    money-limits.ts        rate limits for bank checks and payout requests
    ledger-words.ts, …     pure money helpers (words for ledger rows, payout and settle previews, trail checks, CSV)
  types/                   generated DB types + hand-written domain types
supabase/
  migrations/              timestamped SQL, the source of truth for schema; escrow, settlement and payout transitions live here as functions (§6.6)
  tests/                   pgTAP tests, run by `supabase test db`
  seed.sql
scripts/                   development tools: money-race.mjs (concurrency), sign-webhook.mjs (signed fake webhooks); move-photos-to-media-keys.mjs (one-off storage move, docs/TODO.md §13)
docs/
  PROVIDERS.md             provider-specific dependencies and how to replace them
  creator-directory-decisions.md   why the creator directory works the way it does (Stage 3; portfolio 2026-11-23)
  campaign-spec-decisions.md       campaign rules for Stage 4 onward, incl. pay-per-click (built; see docs/superpowers/specs/2026-11-18-pay-per-click-design.md)
```

All pages use the one design system in `docs/DESIGN_SYSTEM.md`: build from its tokens and components, and extend it (code and doc together) rather than styling around it.

### 4a. Design direction and UI rules

The look is **"porcelain and aurora"** (since 2026-11-10): futuristic but calm, clean and sophisticated. References: Passionfroot (split onboarding with a gradient panel and a "why we ask" card) and Clay (sidebar app shell, quick-action cards with 3D-style icons). Since 2026-11-16 the signed-in portal also takes its structure from HeroUI Pro's dashboards (grouped sidebar, stat cards, titled cards, a "Needs you" list, compact desktop density), built on our own stack and tokens: HeroUI itself is not installed. Borrow structure and feel only: never their names, logos, copy, illustrations or typefaces.

- **Type stays:** Bricolage Grotesque 600 for display, Inter for text. Don't add or swap fonts without the user's say-so.
- **Tokens only.** Colours, radii, shadows and motion come from `src/app/globals.css`. No new hex values in components unless documented as a one-off.
- **Surfaces:** porcelain `canvas` page; white cards as `panel` (hairline + faint shadow); `glass` for anything that floats over content (headers, top bars); `aurora`/`aurora-warm` for illustrated panels only; violet (`brand-violet`) is the one saturated accent, used sparingly. Ink text on pastels; never `muted` on a pastel or an aurora.
- **Layouts:** marketing pages under the floating glass header; auth as a split with the aurora panel; onboarding as one framed split card per question; the portal as a sidebar on the canvas beside an inset white work panel. Details in `docs/DESIGN_SYSTEM.md`, "Page patterns".
- **shadcn/ui:** use it for interactive primitives we would otherwise hand-build badly (dialog, dropdown menu, popover, tooltip, tabs, sheet, select, toast). Add one component at a time with `npx shadcn@latest add <name>` when a feature needs it, keep it in `src/components/ui/`, restyle it to our tokens, and document it in the design system. Don't install components "for later". Native elements (`<dialog>`, `<details>`, radio inputs) are fine where they already work.
- **Motion is CSS only and subtle** (`enter`, `reveal`, `animate-aurora`, `animate-marquee`, `beam`, `skeleton`, …; see the design system's "Motion": entrances move 8px at most, hovers 1px, ambient loops are slow and faint). Every animation runs only under `motion-safe`/`prefers-reduced-motion: no-preference`, and the page must be complete and readable with motion off. Animate `transform`, `opacity` and `filter`, never layout. Entrances 0.3–0.9s; ambient loops slow. No animation library until a specific need can't be met with CSS; name it first (§2). The candidate then is `motion`.
- **Loading states are skeletons.** A page's Suspense fallback is a skeleton shaped like that page, built from `src/components/ui/skeleton.tsx` and wrapped in `PageLoading`; never a bare spinner or "Loading…" text. New pages get one in the same change.
- **Cursor:** marketing pages use the triangle pointer on clickable things (`triangle-cursor`, set by the marketing layout). Keep the system cursors in the portal and in text fields.
- **Mobile and slow networks first** still wins over effects: no video or heavy image backgrounds, no JavaScript just for decoration, and check every page at 390px.
- **Illustrations use fictional sample data** marked "Sample" and labelled as one image for screen readers. Never fake brand logos, testimonials, counts or statistics (§3).

Co-locate code with the feature that uses it. Don't create `utils/` dumping grounds; a helper used in one place lives next to that place.

---

## 5. Domain model & state machines

Every status below is a Postgres enum or check-constrained text column. **Transitions are validated server-side in one place per entity**, never trusted from the client.

### Roles
`business`, `influencer`, `admin`. A user has exactly one role (decide before building if a person can be both; if yes, model it as two profiles, not one tangled profile).

### Campaign
`draft → open → in_progress → completed`; also `closed` (stopped accepting applications, or taken down by an admin) and `cancelled`. Since Stage 4 also `pending_review` (a business's first campaign, between `draft` and `open`) and `paused` (hidden from influencers, back to `open` on resume). All changes go through `transition_campaign()` in the database.
- Fields to capture at creation: title, brief, deliverables, platforms, niche/category, location, follower criteria (minimum range per platform; optional "verified creators only"), payment model (fixed price at first), default price per influencer, slots needed, application deadline, deliver-by date.
- A campaign is listed to influencers only while `open` and not past deadline and slots not all filled.
- Campaigns are visible only to signed-in influencers, admins and the owning business. Deliverables are a structured list (platform, type, quantity) plus notes. Once a campaign is live, price, requirements, deliverables and any destination link are locked; wording, deadline and extra slots can change. A business's first campaign is held for admin approval. Details: `docs/campaign-spec-decisions.md`.
- **Pay per click** (Part 1 built 2026-11-19; design `docs/superpowers/specs/2026-11-18-pay-per-click-design.md`): `payment_model = 'per_click'` adds `cpc_kobo` (≥ ₦50, whole naira), `destination_url` (https; checked in `src/lib/campaign.ts`), `utm_tags` and `blocked_channels`; `price_kobo` is the budget per creator (≥ ₦5,000, a whole number of clicks). Those terms lock on submit, every per-click campaign goes to admin review (a stand-in for domain verification), and a creator can't propose a price for the budget. **Creators propose their own cost per click (decided 2026-11-22, reversing the Stage 4 rule; design `docs/superpowers/specs/2026-11-22-per-click-creator-rates-design.md`):** a creator's optional rate (≥ ₦50, whole naira, and it must fit the budget in whole clicks) is `applications.proposed_cpc_kobo`, set through `set_application_rate()` (a separate call after applying, so `apply_to_campaign()` is untouched); the business sees every rate, can order by it, and hires through `approve_application_at_rate()`, which refuses `rate_changed` if the creator changed it since the page loaded; the agreed rate is frozen on the hire as `engagements.cpc_kobo`, and everything that caps, counts or pays clicks (`record_click`, the click summaries, `settle_click_hire`, an admin's release) reads that, never `campaigns.cpc_kobo`. The budget per place stays the business's, so a higher rate means fewer clicks and never a higher spend. Each hire's share is funded like a fixed-price hire. When the creator starts, `start_engagement()` makes the hire's `tracked_links` row; `/r/[code]` (`src/app/r/[code]`) records every hit through `record_click()` and 302s to the destination, and still redirects if recording fails. Billable: a person (not a preview or bot), not from a blocked channel, hire `in_progress`, before the end of `deliver_by` (Lagos), under the cap, once per visitor per link per 24h, ≤ 20 hits a minute per visitor. `record_click()` locks the hire (share) then the link: settlement must take them in that order. `link_clicks` is append-only; visitors are an HMAC with `CLICK_HASH_SECRET`, never a raw IP. **Click money (Part 2, built 2026-11-20):** clicks count until the end of `deliver_by` (Lagos); 72 hours later the daily `/api/cron/settle-clicks` (`settle_due_click_hires()`) settles each unsettled `funded`/`in_progress` per-click hire through `settle_click_hire()` → `settle_money()`, releasing `least(billable × cpc, agreed price)` (outcome release/split/refund; status `accepted` or `refunded`). The same job tells both people once when the window ends (`click_hold_started`). A started hire settles only once both people have had 72 hours' notice, so a late run never notifies and settles together; a hire that never started gets no notice and is refunded at the hold. A creator who withdraws after starting only stops the clicks (`clicks_stopped_at`, and the business is told: `clicks_stopped`); they're paid for the clicks so far at the hold. An admin "release" on a per-click hire (dispute or escrow tool) pays what the counted clicks are worth, never the whole budget; the admin preview (`settlePreview`, `clickEarnedKobo`) shows the same. Either person may open a dispute during the hold (not while clicks count); an open dispute holds the settlement, and an admin decides as usual. Stage 7 submissions are refused on per-click hires; instead the creator records proof for the record (`click_proofs`, no review). **Dashboards (Part 3, built 2026-11-21):** the business campaign page, both hire pages and the admin dispute and money-trail pages show clicks per Lagos day (CSS bars, no chart library), where visits came from and, per creator, counts, spend and posts added (`link_summary`/`campaign_click_summary` add `days` and `sources`); once every paid hire on a campaign has settled, `campaign_click_results()` gives "How it went" (spent, back to the wallet, our fees), and the business can download `/business/campaigns/[id]/clicks.csv`. **Once clicks have stopped, a per-click campaign's `deliver_by` can't change** (owner's decision 2026-11-20; `campaigns_before_write()`, migration `20261121100000`), so the settle date both sides were told holds.
- Slots filled = number of `approved`/`active` engagements. Enforce in the database (constraint or transaction), not only in the UI. Two business clicks must never over-fill slots.

### Application
`submitted → shortlisted? → approved | rejected | withdrawn`
- Application stores the influencer's proposed price (nullable; null = accepts campaign default).
- **Eligibility is checked server-side at apply time** against the campaign criteria (min followers, niche, location, platform). The UI should show *why* someone is ineligible rather than hiding the campaign.
- One application per influencer per campaign (unique constraint).

### Engagement (the unit that carries money)
Created when a business approves an application. Holds the **agreed price** (campaign default or negotiated; frozen at funding time).

`awaiting_payment → funded → in_progress → submitted → accepted | denied → (resubmitted → …)`
plus `disputed`, `auto_released`, `cancelled`, `refunded`. `paid_out` stays in the enum but is never used (payouts come from the wallet). Since Stage 7 everything after `in_progress` is built: the engagement is `submitted` while its latest round waits for review, `denied` after a denial, `disputed` while a dispute is open, and `accepted` or `auto_released` once the escrow is released. Decided in Stage 7: the creator can withdraw from `funded`, `in_progress` or `denied` (a withdrawal after starting settles as creator at fault, §6.2); either person can open a dispute from `denied`; the business can also open one from `in_progress` once the campaign's deliver-by date (end of that day, Lagos time) and 7 days after the start have both passed. Nothing settles by itself while a dispute is open.

- An influencer must **not** start work until the engagement is `funded`.
- **"Work started" = the influencer clicks "Start work" on a `funded` engagement** (`funded → in_progress`). Show a clear confirmation before they click. This moment decides who can cancel alone (see §6.2).
- If a business doesn't fund within **48 hours** of approval, the approval lapses (`awaiting_payment → cancelled`, reason `payment_expired`) and the place is freed. `expire_unpaid_engagements()` does it, run daily (03:00 UTC, `vercel.json`) by `/api/cron/expire-engagements`, and before every approval and every application on the same campaign. The stored status can lag the deadline, so `engagement_json` (which every read goes through) shows an unpaid hire past its deadline as `cancelled`/`payment_expired` at once, unless a payment started in the last 30 minutes holds it. An application can have many hires over time but only one that isn't cancelled; when a hire ends without ever being paid for, its creator can apply again on the same application (`apply_to_campaign` sets it back to `submitted`) and the business can hire them again or pass (`approve_application` and `decide_application` accept it; the "To decide" tab and counts include it, and it never reads as a filled place under "Hired"). The rule lives in one place: `engagement_lapsed` and `hire_ended_unpaid` in the database, `hireEndedUnpaid` and `applicationBucket` in `src/lib/applications.ts`. Since Stage 6 the business pays from the engagement's pay page (§6.6).

### Submission
Proof of work: up to 10 links, 0–5 screenshots (stored as WebP, private `work-proof` bucket) and a note of up to 1,000 characters; at least one link or screenshot. `pending_review → accepted | denied | auto_accepted`. Built in Stage 7 (`20261117100000_create_submissions.sql`).
- Denial **requires** 1–5 reasons (3–500 characters each), stored and shown to the influencer.
- After denial the influencer can resubmit, **at most 3 times** (`round` is 1–4), or either person can open a dispute.
- **Review window: exactly 7 days from each submission**, stored as `review_deadline_at` and never recomputed. A denial or a dispute stops the clock; a resubmission starts a new 7 days. `auto_accepted` is a submission the business never reviewed; the hire becomes `auto_released`. The daily `/api/cron/review-deadlines` releases overdue hires (one subtransaction per hire, so one failure doesn't block the rest) and sends the review reminders: one once 3 days or less are left and one once 2 days or less are left (worded "1 day left", so the daily job always gives about a day's notice); if both are due at the first run, only the later one is sent.
- **Disputes** (`disputes`, `dispute_statements`, `20261117100200_create_disputes.sql`): a written reason of 20–2,000 characters, then statements (1–2,000 characters, append-only, contact details refused but not a strike) from both sides until an admin decides from `/admin/disputes` with a written reason. One open dispute per hire. The opener can withdraw it; the business can also accept the work during a dispute, which releases in full and closes it.

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
- **Per-click hires: the business fee is kept only on what was spent:** `least(fee paid, greatest(5% of the amount released, ₦500, Paystack's charge on the payment that funded the hire))`; the rest of the fee comes back to the business wallet with the unspent budget (`settle_money()`'s per-click branch, `clickFeeKept()` in `src/lib/fees.ts`). A business cancel before the start uses the same rule with nothing released. Because Paystack's charge is a floor, a paid per-click hire never loses money.
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
- **Do not build wallet top-ups yet.** The wallet fills only from refunds (and from stranded payments, §6.6) until a real need appears.

### 6.4 Expected profit per ₦50,000 job (before support costs)

Completed or auto-released ₦4,046 · business cancels ₦1,546 · business wins dispute ₦1,546 · split ₦2,796 · influencer at fault ₦0. Never negative on the payment itself. These figures assume Paystack's published rates plus 7.5% VAT on its fees; the support-cost reserve used in planning (about ₦750 per job) is an unmeasured assumption, so replace it with real dispute data after the pilot. Card chargebacks raised through a business's bank (Paystack charges ₦2,500 each) fall outside our dispute process and are the one way a payment can still lose money.

> **Compliance flag (raise with the user, don't decide alone):** holding third-party funds and paying them out may carry regulatory implications in Nigeria (e.g. CBN/PSP rules). Confirm with a lawyer/Paystack how escrow-style flows should be structured before launch. Do not make legal claims in the product copy.

---

### 6.5 Enforcement and money (decided in Stage 5)

Strikes, blocks and suspensions protect people; they never take money.

- **Blocking is person to person.** It stops new messages and new hires between the two people. It freezes, cancels or settles nothing that's already agreed.
- **Strikes:** a chat message with contact details (phone number, email, link to another app) is not delivered and is a strike. 1 = warning; 2 = no new messages, applications or hires for 3 days; 3 = suspended until an admin reviews. Strikes don't expire; an admin can remove one, with a written reason. No automatic permanent ban; one appeal a day.
- **Suspension is not forfeiture.** A suspended account keeps everything it's owed: running work, escrow and payouts carry on. It loses only new activity and its listings (directory, open campaigns).
- **No fake escrow.** Never mark money "held" because of a strike. If a payment ever needs holding (Stage 6 onward), the hold is per payment, written to the ledger, with a required reason, and reviewable.
- `moderation_events` is append-only (who, what, why, when). Changes go through the database functions in `20261110100000_create_moderation.sql`, never direct writes.

### 6.6 How the ledger, escrow and payouts work (built in Stage 6)

Design and reasons: `docs/superpowers/specs/2026-11-13-stage-6-money-design.md`, including §13, "Built differently from this design". Everything below is in test mode until the compliance flag above is settled.

**The ledger** (`ledger_entries`, migration `20261113100000`)
- One row per signed amount in kobo, grouped by `group_id`: a group is one business event and sums to zero. Only `post_ledger_group()` writes, and it refuses an unbalanced group. A trigger rejects update, delete and truncate for every role; corrections are reversing groups with a `reason`.
- **Sign convention:** cash (`paystack`) and expense (`paystack_fees`) are positive; liabilities (`escrow`, `business_wallet`, `creator_wallet`, `payout_in_flight`) and revenue (`platform_revenue`) are negative. A balance is the negated sum, read through `wallet_balance()`; the screens word and sign rows through `lib/ledger-words.ts`.
- **Event types** (a check constraint; widen it in a new migration if you need another): `payment_received`, `hire_funded`, `hire_settled`, `payout_requested`, `payout_rejected`, `payout_paid`, `payout_failed`, `paystack_fee`, `correction`. Rows carry the actor (null for the system), the engagement, payment or payout, the Paystack reference and the `fee_config` id used.
- People read only their own wallet rows and the escrow rows of their own hires; admins read everything. Neither `anon`, `authenticated` nor `service_role` may write the table directly, nor call `post_ledger_group()` (the service role's grant was revoked in `20261113100600`): only the money functions post, as the function owner. The unused `save_bank_account()` lost the service role's grant in the same migration.

**Paying a hire** (`20261113100100`)
- `start_payment()` freezes the total (price plus business fee), the fee, the `fee_config` id, the wallet part and the card part on a `payments` row, and a reference `pit_<32 hex>`. The business must tick the non-refundable-fee notice; the time is stored. Wallet balance is used first; if it covers the whole total the app calls `pay_from_wallet()` instead (`wallet_covers_total`).
- **A card payment goes straight to escrow.** `record_card_payment()` (service role) stores the event key first and answers `funded`, `stranded`, `duplicate`, `mismatch` or `unknown_reference`. Funding writes one `payment_received` group (Paystack cash in, escrow price, platform revenue fee) and a `paystack_fee` group for Paystack's actual charge from the verified transaction. The business wallet never shows a card payment as a balance.
- **Stranded payments.** A payment that succeeds after the approval lapsed, after a cancel, after another payment funded the hire, or when the wallet part is no longer covered, credits the business wallet and nothing else. The wallet therefore holds only refunds and stranded payments; there are no top-ups. The business is told (`payment_stranded`): an AFTER INSERT trigger on `ledger_entries` (`20261113100600`) fires on a `payment_received` row with a negative `business_wallet` amount, a shape only a stranded payment writes.
- A payment started in the last 30 minutes holds the lapse and the business's cancel. Money functions take locks in one order (the business's `users` row, then the engagement, then the payment), so two payments, or a payment and the lapse, cannot both win. The fee on the engagement (`business_fee_kobo`, `creator_fee_bps`, `creator_min_fee_kobo`, `fee_config_id`) is a snapshot from the payment's frozen config and never changes.

**Settling and cancelling** (`20261113100200`, `20261113100250`)
- Escrow leaves a hire only through `settle_money()`, one `hire_settled` group that empties the hire's escrow exactly. Outcomes: `release`, `refund`, `split` (admin-chosen whole-naira amount), `refund_creator_fault`. The creator fee applies to the part released (5%, minimum ₦500, never more than the part). Any release sets the engagement to `accepted`; a full refund sets `refunded`. `paid_out` is not used: payouts come from the wallet, not from one engagement.
- **Fault refund:** the business gets price plus business fee minus the Paystack charge of the one payment that funded the hire (wallet-only funding has none), capped so the business never gets back less than the price. A stranded late payment is not part of the hire; its charge was already absorbed.
- Who may call what: `settle_engagement()` (admin only, checked inside) is the admin tool and still settles only `funded` and `in_progress` hires: an admin can't override a business's review without a dispute. `settle_engagement_internal(engagement, outcome, release_kobo, reason, actor, release_status)` has **no grant to any role** (not `authenticated`, not `service_role`) and is called only from Stage 7's own `security definer` functions: `accept_submission()` (the business), `release_overdue_submissions()` (the cron, service role) and `decide_dispute()` (an admin). `withdraw_from_engagement()` (the creator, after starting, from `in_progress` or `denied`) calls `settle_money()` directly as `refund_creator_fault`, like `cancel_funded_engagement()`. It settles hires in `funded`, `in_progress`, `submitted`, `denied` and `disputed`; `release_status` is `accepted` (the default) or `auto_released`. `start_engagement()` (the creator) and `cancel_funded_engagement()` (the business) are the other user-callable ones. The settlement notice (`engagement_settled`) skips the person who acted and carries `settled_by` (their role, or null for the system) so the other side can be told who settled. Settling a settled hire is a no-op that writes nothing.
- **Creators see the net, never the gross, as their credit.** `engagements.released_kobo` is what left escrow, before the creator fee; the wallet credit is that minus the fee. The creator's "settled" notice carries `creator_net_kobo` and `creator_fee_kobo`, read from the settlement's own ledger group (`20261114100200`); `creator_wallet_summary()` (service role, `20261114100300`) gives the wallet page its statement (earned before our fee, the fee, payouts, left) and `wallet_summary.test.sql` holds that the parts add up to `wallet_balance()`. Each job payment in the history shows "₦25,000 earned, less our ₦1,250 fee", and a creator's top bar shows the same balance as a link to the wallet.

**Payouts** (`20261113100300`, `20261113100500`, `20261113100550`)
- A creator's bank account is saved by the server after Paystack resolves the account name and creates a transfer recipient (`save_bank_account_for()`, service role only); only the bank, the last four digits, the name and the recipient code are stored, never the full number.
- `request_payout()` checks the minimum (₦1,000, from `fee_config`) and the balance under the creator's lock, debits the wallet into `payout_in_flight`, and snapshots the destination and the transfer cost on the payout. The cost is Paystack's tier fee plus a flat ₦50 stamp duty from ₦10,000, paid by the creator and shown before they confirm.
- **Every payout is approved by an admin.** `approve_payout()` moves `requested → processing` and fixes the reference `pit_po_<32 hex>`; the server then calls Paystack Transfer with the snapshotted destination. If that call fails, the payout stays `processing` and the daily check finishes it. `reject_payout()` needs a reason and returns the amount to the wallet. `paid`, `failed` and `rejected` are final.
- `finish_payout()` (service role) stores the event key first; a repeat is `duplicate`, the same outcome again is `duplicate`, and a contradicting event after a final state (for example `failed` after `paid`) is `ignored` and moves nothing. It removes any full account number from the stored payload. Cash leaves the ledger only when Paystack confirms the transfer (`paid`), and the wallet is re-credited only after Paystack confirms a failure.

**Webhook and callback** (`src/lib/payments.ts`; routes are thin adapters)
- The signature (HMAC SHA-512 of the raw body) is checked before parsing. Only the event name and the reference are read; the payment or transfer is then verified with Paystack, and the event key is built from Paystack's verified status. Non-NGN charges are not applied. Only a trimmed copy of Paystack's answer is stored.
- The return page and the webhook call the same `confirmCardPayment()`; the stuck-payout poller and the transfer webhook call the same `confirmTransfer()`.
- **Retries:** an invalid signature is 401. If verifying fails with Paystack 400 or 404 (it does not know the reference) the event is acknowledged with 200. Any other Paystack or database error (outage, 429, 401, 403) returns 500 so Paystack retries, because nothing else polls card payments. A charge Paystack still calls pending returns 503. A transfer that Paystack cannot find is failed only once its payout has been `processing` for over 15 minutes. A `needs_review`, currency-mismatch or amount-mismatch payment is only logged for now (one `console.error` line with the event and the reference; `docs/TODO.md`). A charge Paystack reports as `reversed` is treated as failed: nothing is written and the webhook is acknowledged.

**Reconciliation and the admin audit tools** (`20261113100500`)
- `/api/cron/money-checks` runs daily. It settles payouts stuck in `processing`, then records a `reconciliation_runs` row (append-only) from Paystack's balance. Expected cash is `−(escrow + business_wallet + creator_wallet + payout_in_flight + platform_revenue) − paystack_fees` using the stored signs. A non-zero difference, or a ledger whose accounts do not sum to zero, shows in `note` and as a callout on `/admin/money`. If the balance cannot be read, no row is written. The response is 500 if any step failed.
- Admin tools, one page per job: `/admin/money` (the latest reconciliation and links to the rest), `/admin/money/escrow` (hires in escrow with settle actions), `/admin/money/reconciliation` (every run, paged), `/admin/money/payouts` (waiting and decided, with **Check with Paystack** on a payout still `processing`, which runs the same `confirmTransfer()`), `/admin/money/ledger` (filters, CSV export), and `/admin/money/engagements/[id]`, a per-hire trail that must add up. Businesses and creators see their own wallet and trail without the internal accounts.

**Tests that protect these rules:** `supabase/tests/{ledger,funding,settlement,payouts,money_notifications,stranded_notification,audit,submissions,auto_release,disputes,engagement_creator_net,engagement_deliverables,per_click_rates}.test.sql` (append-only, balanced groups, funding and settling twice, wallets never negative, grants and RLS, payout state rules, the reconciliation arithmetic, the submission and dispute state rules, auto-release, the creator's net on a hire); `src/lib/*.test.ts` (fee maths, including the business fee being larger than Paystack's charge for every allowed price, and that the `fee_config` seed equals `src/lib/fees.ts`; the webhook decisions; the cron); and `scripts/money-race.mjs`, which races the money functions from separate Postgres sessions on the local database (scenarios 16–21 are the Stage 7 paths: accept against auto-release, deny against auto-release, decide dispute against accept, double submit, creator withdraw against accept, decide dispute against withdraw dispute; 23–28 are pay per click: two clicks at the cap, a click against the hire ending, the settle job twice at once, against opening a dispute, against deciding one, and a click against settlement; 29–30 are creator rates: an approval against the creator changing their rate, and an approval twice at once; lock order for click money is users, engagement, then the tracked link; the rate approval locks the campaign, then the application, like `approve_application()`). Add a test there, not only in pgTAP, for any new money function that two callers could reach at once.

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

Built so far (2026-11-11): the in-app side. Database triggers write `notifications` rows (kind + facts) wherever an application, hire, message, campaign review, verification, profile visibility or appeal changes; the words and links live in `src/lib/notifications.ts`; the bell in the portal top bar shows them live. Messages are one entry per conversation, cleared when the thread is read. Stage 6 added the money kinds (hire funded, work started, a paid hire cancelled, escrow settled, payout paid, failed or rejected; trigger functions in `20261113100400_money_notifications.sql`) and the stranded-payment notice to the business (`payment_stranded`, a trigger on `ledger_entries` in `20261113100600_stranded_payment_and_hardening.sql`). Stage 7 added `work_submitted` (to the business), `submission_denied` (to the creator, with the reasons), `review_reminder` (to the business once 3 days or less and once 2 days or less are left, the second worded "1 day left"), `dispute_opened`, `dispute_statement` and `dispute_withdrawn` (to the other side), and the auto-release notice, which reuses `engagement_settled` (`status: auto_released`, `settled_by` null); triggers are in `20261117100300_stage7_notifications.sql`. Email for all of them is built; see the next paragraph.

The creator portfolio added `portfolio_sample_hidden` and `cover_removed` (to the creator, with the admin's reason; sent from `hide_portfolio_sample()` and `clear_cover()`, migration `20261127100400`), both emailed `always`.

Pay per click added `click_cap_reached` (to the creator, once, when their link reaches its cap; sent from `record_click()`) and `click_hold_started` (to both, once, when the click window ends; sent by the daily settle job), both emailed `always` (migration `20261120100000`). Settlement reuses `engagement_settled`.

Email built (2026-11-18, Stage 8): `notifications` has the queue columns `email_due_at`, `emailed_at` and `email_attempts` (migration `20261118100000`; `notify()` sets the due time: now for most kinds, 15 minutes later for chat, and a chat thread gets at most one email an hour). `sendDueEmails()` in `src/lib/send-emails.ts` claims the due rows, renders and sends them, and marks them done or leaves them for a retry. It is called right after the action or webhook that caused the notification (`sendEmailsAfterResponse()` in `src/lib/email-after.ts`, so a failure never fails the action), at the end of each daily job, and from `/api/cron/send-emails`, which Supabase `pg_cron` calls every minute (a backstop for the chat delay and retries; migration `20261118100100`, URL and secret in Vault) and Vercel Cron daily. People choose three switches in `notification_preferences` (applications, campaigns, messages); every kind in `EMAIL_POLICY` marked `always` in `src/lib/notification-email.ts` (all the money, work, dispute, verification and standing kinds, except `work_started` and `hire_cancelled`, which belong to the switchable applications group) sends regardless. Resend is called only from `src/lib/resend.ts`.

Rules: one `notifications` table is the source of truth; email is a delivery channel off it, not a parallel system. Add new events as triggers (or in the one function that makes the change) plus a case in `describeNotification`; never notify someone of their own action. Emails are transactional templates in code; keep them plain and testable. Respect user notification preferences, except for money-critical messages which always send.

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
- Accessibility basics: labels, focus states, keyboard navigation, sufficient contrast, and nothing that only works with motion on (`prefers-reduced-motion`). This audience is mobile-first: **design for small screens and slow networks first**.

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

Decided in Stage 2 (2026-11-09):
- **One role per account.** An account is a business or an influencer, fixed at sign-up. Someone who is both signs up twice with different emails. Admins are made by hand in SQL, never through sign-up.
- **Sign-in is email + password only** at first (no Google, magic links or phone codes yet).
- ~~Sign-up and login stay unlinked until launch~~ Changed 2026-11-10: **there is no waitlist any more.** The site links straight to `/signup` and `/login` (header, hero, the creator and business sections, the directory). The landing page's "I'm a business / creator" links preselect the account type with `?role=`. The `waitlist` table and its emails are kept; nothing writes to it.
- **Auth emails go through Resend** (custom SMTP in Supabase). The templates live in `supabase/templates/`.

Decided in Stage 3 (2026-11-09; details in `docs/BUILD_PROMPT.md`, Stage 3, and `docs/creator-directory-decisions.md`):
- **Follower counts are self-reported ranges at launch**, labelled as such. Creators upgrade to **Verified** by putting a single-use Pitchype code in their bio; an admin confirms it and records the follower count seen. One verified account per handle; conflicts go to admin review. Automate later only through official platform APIs, never scraping.
- **The creator directory is public**, with less detail signed out: handles, links to sample posts, starting rate and the price filter are for signed-in businesses (and admins) only, enforced in the database. Profiles are drafts until published; creators can opt out of search indexing.
- **Creator portfolio (decided 2026-11-23; `docs/superpowers/specs/2026-11-23-creator-portfolio-design.md`):** the bio is public; a cover and up to 6 work samples (caption, platform, post link; the link for businesses only), admin takedown with a reason (the creator is notified); pictures stored under a random `media_key` folder, never the user id; a public track record (paid jobs, hidden at zero; member since); sorting (newest, most followers, verified first); @handle search for businesses and admins only. Details in `docs/creator-directory-decisions.md` §5.

Decided while planning Stage 4 (2026-11-09; details in `docs/campaign-spec-decisions.md`):
- **Campaigns are visible only to signed-in influencers, admins and the owning business.**
- **Business requirements:** platforms, niches, states or anywhere in Nigeria, a minimum follower range per platform, and an optional "verified creators only" switch (default off). No engagement-rate requirement.
- **Deliverables are structured** (platform, type, quantity, optional posting window) plus free-text notes.
- **Fixed price per creator, whole naira, minimum ₦5,000.** Fees follow §6.1. Nothing is escrowed at publish; escrow happens per engagement (§5, §6).
- **Campaigns publish without review, except a business's first campaign**, which an admin approves. Report button and admin takedown apply. Briefs are checked for phone numbers and WhatsApp links.
- **Editing after publish:** wording, deadline, extra places and closing early are allowed. Price, requirements, deliverables and the destination link are locked. Accepted creators keep a snapshot of the terms they agreed to.
- **Pay per click is decided but built after Stage 6.** One short tracked link per creator per campaign (never the destination in the URL), a click budget escrowed at go-live, only billable clicks paid, payouts in batches after a hold. Stage 4 only stores `payment_model`.
- **No campaign images for now** (see `docs/TODO.md`).

Decided in Stage 5 (2026-11-10; details in `docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md`):
- **Approval creates an `awaiting_payment` engagement** and sends the business straight to pay. Nothing starts until it's paid. **48 hours to pay**, then it lapses (§5).
- **A creator's proposed price:** whole naira, minimum ₦5,000, no ceiling. The business approves the price it saw; if the creator changed it since, approval is refused.
- **The business messages first.** Creators reply in threads a business started.
- **Contact details in chat** aren't delivered and count as strikes; blocking, strikes and suspension work as in §6.5.

Decided in Stage 6 (2026-11-13; design in `docs/superpowers/specs/2026-11-13-stage-6-money-design.md`; how it works in §6.6):
- **Minimum payout ₦1,000**, on request, no schedule; stored in `fee_config`.
- **Every payout is approved by an admin** before any transfer is sent. The admin approves or rejects (with a written reason) from `/admin/money`.
- **Card payments go straight to escrow.** A payment that succeeds after the approval lapsed (or the hire was cancelled) is not refunded to the card: it lands in the business wallet. The wallet holds only refunds and such stranded payments; there are no top-ups.
- **An admin releases, refunds or splits escrow**, with a written reason. Stage 7's accept, auto-release and disputes call the same function (`settle_engagement_internal`, §6.6).
- **The creator pays the transfer cost**: Paystack's tier fee plus the ₦50 stamp duty from ₦10,000, shown before they confirm.
- **The payout destination is snapshotted** on the payout when it is requested; changing the bank account later cannot redirect it.
- **Suspended accounts are still paid out** (§6.5); Stage 6 has no payment holds.
- **Business wallet withdrawal to a bank is still not built** (open item 9 stays open); an admin refunds by hand on request.

Decided in Stage 7 (2026-11-17; design in `docs/superpowers/specs/2026-11-17-stage-7-submissions-disputes-design.md`; how it works in §5 and §6.6):
- **At most 3 resubmissions** after denials, so up to 4 rounds per hire.
- **Either side can open a dispute after a denial** (any denial, not only the last). The business can also open one on non-delivery once the deliver-by date and 7 days after the start have both passed. There is no dispute from `submitted`: the business denies first.
- **An admin decides every dispute** from `/admin/disputes`, with a written reason and the same four outcomes as the Stage 6 escrow tool. The other side is asked to respond within 3 days and an admin aims to decide within 5 working days; both are shown, not enforced.
- **Review window 7 days** from each submission, reminders once 3 days or less and once 2 days or less are left, worded "1 day left" (only the later one if both are due at the first run), auto-release after that. Emailed since Stage 8.
- **Creator withdrawal after starting** is allowed and settles as creator at fault (§6.2).
- **`paid_out` stays in the enum**, unused.

Still open:
1. ~~Can one account be both a business and an influencer?~~ Decided above: no.
2. ~~Deadline to fund after approval before the approval expires.~~ Decided above (Stage 5): 48 hours.
3. ~~Maximum resubmission rounds after a denial, and the dispute process.~~ Decided above (Stage 7): 3 resubmissions; either side can dispute after a denial, the business also on non-delivery; an admin decides; the other side is asked to respond within 3 days and an admin aims to decide within 5 working days (shown as expectations, not enforced).
4. ~~Minimum payout amount and payout schedule.~~ Decided above (Stage 6): ₦1,000, on request, no schedule.
5. Whether negotiated prices can be changed after funding (default: no; cancel per §6.2, then re-engage).
6. ~~Influencer verification~~ Decided above (Stage 3): self-reported ranges plus bio-code verification by an admin.
7. Launch markets/currencies (NGN first? others later?).
8. Legal/regulatory structure for holding funds in escrow and in business wallets (see §6 flag).
9. Whether businesses can withdraw wallet balance to their bank (recommended: yes, on request).
10. Whether gambling/betting campaigns are allowed, and the full banned-categories list for the terms.
11. ~~Pay-per-click numbers.~~ (Rate proposals by creators were added 2026-11-22; see §5.) Decided 2026-11-18 (design `docs/superpowers/specs/2026-11-18-pay-per-click-design.md` §3): ₦50 minimum per click; ₦5,000 minimum budget per creator, each creator's share funded per hire; a 72-hour hold after the click window, then one settlement per hire (no weekly batches, no separate click payout minimum); the business fee is charged only on what was spent, never less than ₦500 or Paystack's charge on that payment.

---

## 13. Working agreement with Claude

- Show the plan briefly for non-trivial work; then build it. Don't over-explain trivial changes.
- Match the existing code style; don't reformat unrelated files.
- If you notice a bug or risk outside the task, report it; don't fix it unasked unless it's a one-line obvious fix, and say so.
- Say what you verified and what you didn't. Never claim a flow works if you didn't run it.
- When unsure whether something is over-engineering, it probably is: choose the simpler version and mention the trade-off.
- When you defer something (a dashboard step, polish, a known gap), add it to `docs/TODO.md`; tick items off there when they're done.
