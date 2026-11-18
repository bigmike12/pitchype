# Audience Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/for-business` and `/for-creators` as in-depth marketing pages, slim the homepage to a front door, and skip the account-type question at sign-up when the visitor already chose a side.

**Architecture:** Two hand-written static pages under `src/app/(marketing)/`, each composing existing landing components plus a few new shared presentational ones (hero, why, closing CTA). Sign-up reads a validated `?role=`; the signed-out header's "Get started" picks the role from the pathname through one small pure function. No template framework, no new dependencies, no database change.

**Tech Stack:** Next.js 16 (App Router, Cache Components, static prerender), React 19, Tailwind v4 with the project's tokens, `node --test` for unit tests, Playwright for browser checks.

**Spec:** `docs/superpowers/specs/2026-11-18-audience-pages-design.md` (read it first; it holds the reasons and the "calls made" list).

## Global Constraints

- URLs are exactly `/for-business` and `/for-creators`. Do not touch `/business/...` (the portal) or `/creators` (the directory).
- Role values in links are exactly `?role=business` and `?role=influencer`.
- Use only tokens, components and motion from `docs/DESIGN_SYSTEM.md` and `src/app/globals.css`: no new hex values, fonts or dependencies. Motion is CSS only and under `motion-safe` (CLAUDE.md §4a). Check every page at 390px.
- Copy states only what is built today: campaigns with structured deliverables and requirements, "verified creators only", the creator directory and its filters, applications and proposed prices, chat, the hiring board, escrow (48 hours to pay after approval), submission with proof, denial with reasons and up to 3 resubmissions, the 7-day review window with auto-release, disputes decided by an admin, refunds to the business wallet, the creator wallet, payouts (₦1,000 minimum, transfer cost shown first, admin-approved), creator profiles and bio-code verification, email notifications.
- Never mention UGC, pay-per-click, wallet top-ups, business wallet withdrawal to a bank, or any figure without a public source and date. No legal claims about escrow (CLAUDE.md §6 flag). Fee numbers come from `src/lib/fees.ts`, never typed by hand.
- Outside stats (`src/components/landing/stats.tsx`) move as they are, with their "global and US figures" footnote.
- Do not commit unless the owner asks. If they do: one commit per task, imperative message, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Quality gate for every task: `npm run lint`, `npm run typecheck`, `npm test` pass. Dev server: `npm run dev` (port 3030). Don't `supabase db reset`.

## Review Focus

Inputs and conditions the spec implies but doesn't spell out; each has its test in the task named.

1. `/signup?role=influencer&role=business` (Next gives an array): shows the picker, not an error (Task 2).
2. `/signup?role=Business` or `?role=admin`: shows the picker; the server still rejects non-roles (Task 2; the existing credentials tests already cover the server side).
3. JavaScript off or slow: the role must still be submitted, so it is a plain hidden input rendered by the server (Task 2).
4. Header CTA on `/for-business/` (trailing slash), a future `/for-business/ugc`, and near-miss paths like `/for-businesses` or `/for-business-x` (Task 1).
5. The new pages scroll sideways at 390px (Tasks 5, 6: added to the existing overflow test).

---

### Task 1: Role-aware sign-up link (pure function)

**Files:**
- Create: `src/lib/signup-link.ts`
- Test: `src/lib/signup-link.test.ts`

**Interfaces:**
- Produces: `signupHrefFor(pathname: string): string`, and the constants `BUSINESS_PAGE = "/for-business"`, `CREATOR_PAGE = "/for-creators"` (used by Tasks 3, 5, 6, 7).

- [ ] **Step 1: Write the failing test** in `src/lib/signup-link.test.ts`, in the style of `src/lib/credentials.test.ts` (`node:test`, `node:assert/strict`). One test, `signupHrefFor picks the role from the audience page`, asserting:
  - `/for-business`, `/for-business/`, `/for-business/ugc` → `/signup?role=business`
  - `/for-creators`, `/for-creators/` → `/signup?role=influencer`
  - `/`, `/creators`, `/creators/ada`, `/for-businesses`, `/for-business-x`, `/business/campaigns`, `""` → `/signup`
- [ ] **Step 2: Run it and see it fail:** `node --test src/lib/signup-link.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `signupHrefFor` in `src/lib/signup-link.ts`. A path matches a page when it equals it or starts with the page plus `/`, the same whole-segment rule as `isUnder` in `src/proxy.ts`.
- [ ] **Step 4: Run the test** → PASS.

### Task 2: Sign-up skips the picker when the role is known

**Files:**
- Modify: `src/lib/credentials.ts`, `src/lib/credentials.test.ts`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signup/signup-form.tsx`
- Create: `e2e/signup-role.spec.ts`

**Interfaces:**
- Consumes: `SignupRole`, `isSignupRole` from `src/lib/credentials.ts`.
- Produces: `signupRoleFromParam(value: string | string[] | undefined): SignupRole | undefined` in `src/lib/credentials.ts`. `SignUpForm({ initialRole?: SignupRole })` keeps its props.

- [ ] **Step 1: Write failing unit tests** in `src/lib/credentials.test.ts`: `signupRoleFromParam` returns `"business"` and `"influencer"` for those strings, and `undefined` for `undefined`, `""`, `"Business"`, `"admin"`, `"creator"`, and `["influencer", "business"]`.
- [ ] **Step 2: Run** `node --test src/lib/credentials.test.ts` → FAIL.
- [ ] **Step 3: Implement** `signupRoleFromParam` in `src/lib/credentials.ts` (string and `isSignupRole`, else `undefined`). Use it in `FormWithRole` in `signup/page.tsx` in place of the inline check.
- [ ] **Step 4: Change `SignUpForm`:** when `initialRole` is set, do not render the `ChoiceGroup`. Render instead `<input type="hidden" name="role" value={initialRole}>` and a visible, non-dismissable line inside the form, above the email field, in the form's normal text size: "Signing up as a business" / "Signing up as a creator" with a "Change" `Link` to `/signup`. Without `initialRole` the form is exactly as today. Change the static lead in `page.tsx` from "Free to join. Tell us how you’ll use Pitchype." to "Free to join." because it sits outside the Suspense and can't know the role.
- [ ] **Step 5: Write the Playwright test** `e2e/signup-role.spec.ts` (style of `e2e/smoke.spec.ts`), four tests:
  - `/signup?role=influencer`: text "Signing up as a creator" visible; no radio inputs named `role`; `input[type=hidden][name=role]` has value `influencer`; the "Change" link has `href` `/signup`.
  - `/signup?role=business`: same with `business`.
  - `/signup`: both radio cards visible.
  - `/signup?role=Business`, `/signup?role=admin` and `/signup?role=influencer&role=business` each show both radio cards (loop).
- [ ] **Step 6: Run** `npx playwright test e2e/signup-role.spec.ts` (dev server on 3030) → PASS on desktop and phone. Then the quality gate.

### Task 3: Header "Get started" follows the page's role

**Files:**
- Create: `src/components/landing/header-cta.tsx`
- Modify: `src/components/landing/site-header.tsx`

**Interfaces:**
- Consumes: `signupHrefFor` (Task 1).
- Produces: `HeaderCta()`, a client component rendering the "Get started" `Link` with `buttonVariants()` and `href={signupHrefFor(usePathname())}`.

- [ ] **Step 1: Implement `HeaderCta`** (`"use client"`, `usePathname` from `next/navigation`), and replace the inline "Get started" link in `site-header.tsx` with it. Leave `NAV_LINKS` alone for now (Task 7 changes them, once the pages exist).
- [ ] **Step 2: Verify:** quality gate, then load `/` and `/privacy` in the dev server and confirm the button still reads "Get started" and links to `/signup`. The role cases are covered by Task 1's test and, once the pages exist, by Tasks 5 and 6.

### Task 4: Export the shared pieces the pages will reuse (no visible change)

**Files:**
- Modify: `src/components/landing/how-it-works.tsx`, `src/components/landing/pricing.tsx`, `src/components/landing/faq.tsx`

**Interfaces:**
- Produces:
  - `how-it-works.tsx`: `export` on `StepList`, `BUSINESS_STEPS`, `CREATOR_STEPS`.
  - `pricing.tsx`: `FeeReceipt({ receipt }: { receipt: Receipt })` (the existing `<article>` extracted), plus `BUSINESS_RECEIPT` and `CREATOR_RECEIPT` (the two existing entries named). `Pricing` renders them exactly as before.
  - `faq.tsx`: `export type FaqItem = { question: string; answer: string }` and `Faq({ items = QUESTIONS, title = "Questions, answered" }: { items?: FaqItem[]; title?: string })`. The section `id` stays `faq`.

- [ ] **Step 1: Make the changes above;** no markup or copy change.
- [ ] **Step 2: Verify nothing moved:** quality gate, `npm run build`, and `npx playwright test e2e/smoke.spec.ts`. Before starting this task, screenshot `/` at 1440px and 390px; after it, screenshot again and confirm the how-it-works, pricing and FAQ sections look identical.

### Task 5: `/for-business`

**Files:**
- Create: `src/components/landing/audience-hero.tsx`, `src/components/landing/audience-why.tsx`, `src/components/landing/audience-cta.tsx`, `src/app/(marketing)/for-business/page.tsx`, `src/app/(marketing)/for-business/sections.tsx`
- Modify: `e2e/smoke.spec.ts` (overflow list), `docs/DESIGN_SYSTEM.md` ("Page patterns": one short entry for the audience-page pattern and its three shared components)
- Test: `e2e/audience-pages.spec.ts` (created here, extended in Task 6)

**Interfaces:**
- Produces (shared with Task 6), all server components, presentational only:
  - `AudienceHero({ eyebrow, title, lead, primaryCta, note }: { eyebrow: string; title: ReactNode; lead: string; primaryCta: { href: string; label: string }; note?: string })`: `<h1>`, same floating-header pull-up, aurora backdrop and `enter` motion as `hero.tsx`, without the illustration.
  - `AudienceWhy({ id, title, rows }: { id: string; title: string; rows: { topic: string; usual: string; pitchype: string }[] })`: the "usual way vs Pitchype" table of `why-pitchype.tsx`, for one side.
  - `AudienceCta({ title, text, cta }: { title: ReactNode; text: string; cta: { href: string; label: string } })`: the closing aurora block of `get-started.tsx` with one button and a "Log in" line.
- Consumes: `StepList`, `BUSINESS_STEPS` (Task 4); `FeeReceipt`, `BUSINESS_RECEIPT` (Task 4); `Faq`, `FaqItem` (Task 4); `ForBusinesses` from `audiences.tsx` (unchanged: it carries the budget splitter, the outside stats and a sign-up button).

- [ ] **Step 1: Write the failing Playwright test** `e2e/audience-pages.spec.ts`, test `/for-business loads and signs up as a business`: `goto("/for-business")` is ok; one `h1` is visible; the header link named "Get started" has `href` `/signup?role=business`; clicking the hero's primary button lands on `/signup?role=business` with "Signing up as a business" visible and no role radios. Run it → FAIL (404).
- [ ] **Step 2: Build the three shared components** above, then `sections.tsx` with the business-only sections: hiring deep dive ("Find and hire creators": the directory and its filters, campaigns with structured deliverables and requirements and "verified creators only", the hiring board and chat), and "How your money is held" (pay within 48 hours of approval, held in escrow, 7 days to review, accept or decline with reasons, up to 3 resubmissions, admin-decided disputes, refunds go to the business wallet, the non-refundable fee told before paying). Use `ProductFragment`, `Avatar`, `Chip` from `src/components/brand/fragments` and `ClayTile` from `stickers` where a visual helps; fictional sample data marked "Sample".
- [ ] **Step 3: Write `page.tsx`** with `metadata = { title: "For businesses", description, alternates: { canonical: "/for-business" } }` (description about hiring creators with escrow; under 160 characters) and this order: `AudienceHero` (suggested H1: "Hire creators your customers already trust."; primary CTA "Create a business account" to `/signup?role=business`), `AudienceWhy` (3–4 rows, business problems only), a "How it works" section using `StepList` with `BUSINESS_STEPS`, hiring deep dive, money section, `ForBusinesses`, `FeeReceipt` with `BUSINESS_RECEIPT` plus the fee notes, `Faq` with 5–6 business items (cost, escrow, what if the creator doesn't deliver, can I set requirements, negotiating, how long to pay), `AudienceCta`. Headlines and copy are suggestions; apply the Global Constraints.
- [ ] **Step 4: Add `/for-business` to the overflow test's path list** in `e2e/smoke.spec.ts` (Task 6 adds `/for-creators`).
- [ ] **Step 5: Run** `npx playwright test e2e/audience-pages.spec.ts e2e/smoke.spec.ts` → PASS on desktop and phone for the business path. Quality gate. Look at the page at 1440px and 390px in a browser.

### Task 6: `/for-creators`

**Files:**
- Create: `src/app/(marketing)/for-creators/page.tsx`, `src/app/(marketing)/for-creators/sections.tsx`
- Modify: `e2e/audience-pages.spec.ts`, `e2e/smoke.spec.ts` (ensure `/for-creators` is in the overflow list)

**Interfaces:**
- Consumes: everything Task 5 produced, `CREATOR_STEPS`, `CREATOR_RECEIPT`, `ForCreators` from `audiences.tsx` (carries the earnings calculator and stats).

- [ ] **Step 1: Add the failing test** `/for-creators loads and signs up as a creator`, mirroring Task 5's with `influencer` and "Signing up as a creator". Run → FAIL.
- [ ] **Step 2: Build `sections.tsx`:** "Find work and apply" (profile and bio-code verification, browsing campaigns with eligibility explained rather than hidden, applying at the listed price or proposing your own, starting only once the job is funded) and "Getting paid" (submit proof as links and screenshots, denial comes with reasons and up to 3 resubmissions, auto-release after 7 days of silence, admin-decided disputes, the wallet, payouts with the ₦1,000 minimum, the transfer cost shown before you confirm, and that payouts are reviewed before they're sent).
- [ ] **Step 3: Write `page.tsx`** with `metadata = { title: "For creators", description, alternates: { canonical: "/for-creators" } }`: `AudienceHero` (suggested H1: "Get paid for your influence, whatever your follower count."; CTA "Create a creator account" to `/signup?role=influencer`), `AudienceWhy` (creator problems: late payment, platform thresholds, back-and-forth prices), "How it works" with `CREATOR_STEPS`, the two sections above, `ForCreators`, `FeeReceipt` with `CREATOR_RECEIPT` plus notes, `Faq` with 5–6 creator items, `AudienceCta`.
- [ ] **Step 4: Run** the e2e files → PASS on desktop and phone; quality gate; look at 1440px and 390px.

### Task 7: Homepage front door, navigation, sitemap

**Files:**
- Create: `src/components/landing/audience-split.tsx`
- Modify: `src/app/(marketing)/page.tsx`, `src/components/landing/site-header.tsx`, `src/components/landing/site-footer.tsx`, `src/app/sitemap.ts`, `docs/TODO.md`
- Test: `e2e/audience-pages.spec.ts`

**Interfaces:**
- Produces: `AudienceSplit()`: two cards in one section. Card one: `id="for-creators"`, one or two lines, a button to `CREATOR_PAGE`, and a plain text link "Create a creator account" to `/signup?role=influencer`. Card two: `id="for-businesses"`, the same for `BUSINESS_PAGE` and `/signup?role=business`. No calculators, no stats.

- [ ] **Step 1: Write the failing tests** in `e2e/audience-pages.spec.ts`: on `/`, `#for-creators` contains a link to `/for-creators` and `#for-businesses` contains a link to `/for-business`, and each id occurs once; the header nav's "For creators" and "For businesses" links point to the new pages; `GET /sitemap.xml` includes both URLs. Run → FAIL.
- [ ] **Step 2: Build `AudienceSplit`** and in `page.tsx` replace `<ForCreators />` and `<ForBusinesses />` with `<AudienceSplit />` (drop their imports). Leave `Features` unchanged: its tiles serve both sides and read fine as a homepage summary (my call; the spec allowed splitting).
- [ ] **Step 3: Update links:** in `site-header.tsx` `NAV_LINKS` and in `site-footer.tsx` `PRODUCT_LINKS`, "For creators" → `CREATOR_PAGE`, "For businesses" → `BUSINESS_PAGE`. In `sitemap.ts` add both URLs with `changeFrequency: "monthly"`, `priority: 0.8`, and update the comment above the function.
- [ ] **Step 4: Update `docs/TODO.md`:** tick or reword the landing-page items this touches (the outside-figures line now points at the two pages), and add: "UGC: add a section to `/for-business` and `/for-creators` when it ships; the homepage gets a line."
- [ ] **Step 5: Run** the e2e files → PASS on desktop and phone. Quality gate.

### Task 8: Full check and visual pass

**Files:** none expected; fix what the check finds in the file it belongs to.

- [ ] **Step 1: Run the gate:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (both new pages must show as static `○` in the route table), then `npx playwright test` on both projects. All pass.
- [ ] **Step 2: Look in a browser** (dev server on 3030; use the Chrome tools, or headless Chrome as in the `local-visual-check` memory if they are down) at 1440px and 390px: `/`, `/for-business`, `/for-creators`, `/signup`, `/signup?role=business`, `/signup?role=influencer`, the "Change" link, the header button on each page, `/#for-creators` and `/#for-businesses` landing on the cards. Check reduced-motion renders complete pages.
- [ ] **Step 3: Check the copy** of both pages against the Global Constraints list (no UGC, no unbuilt features, no unsourced figures, fee numbers from `fees.ts`).
- [ ] **Step 4: Report plainly** what was exercised and what wasn't. In particular, say whether an actual account creation through the role-fixed form was run; if not, say the hidden field's value was verified but the submission wasn't.
