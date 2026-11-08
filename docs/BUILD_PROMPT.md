# Pitchype — Build Prompt (Stage 1: Landing Page)

> How to use: open Claude Code in the `pitchype` folder and paste everything from **"START OF PROMPT"** to **"END OF PROMPT"**. Later stages (see the roadmap at the bottom) each get their own prompt, written after the stage before it ships.

---

## START OF PROMPT

You are building **Pitchype**, a two-sided marketplace that connects businesses with micro and nano influencers ("creators"), starting in Nigeria. Think Fiverr/Upwork, but for influencer work: businesses post campaigns or hire creators directly, creators apply and get paid through escrow.

### 0. Read first (do this before writing any code)

1. Read `CLAUDE.md` in this folder fully. It is the source of truth for engineering philosophy, stack, money rules and fees. Follow it. If anything in this prompt conflicts with it, stop and tell me.
2. Read `docs/design-inspiration-clay.md`. It is a design analysis of another brand's website, supplied **as inspiration only** (see §3 for exactly what to take and what not to take).
3. Look at what already exists in the folder. It was nearly empty at the start (just a `.next` folder). Do not delete anything without asking.

Then give me a short plan (10 lines max) and start building. Don't wait for approval unless something blocks you.

### 1. Scope of THIS stage

Build a **single, production-quality, public landing page** plus a **working waitlist signup**, deployed-ready on Vercel with Supabase behind the form. Nothing else.

**In scope**
- Project scaffold (Stage 0, below).
- The landing page at `/`, fully responsive, accessible and fast.
- A waitlist form (email + "I'm a business" / "I'm a creator") that saves to Supabase.
- Basic SEO/social metadata, favicon, `robots.txt`, `sitemap.xml`.
- A simple `/privacy` and `/terms` placeholder page each (clearly marked "draft, to be reviewed by a lawyer"), because the waitlist collects emails.

**Out of scope (do NOT build yet)**
Auth, dashboards, campaigns, applications, chat, payments, Paystack, wallets, admin, analytics tools, CMS, blog, i18n, dark mode, animation libraries. Do not add placeholders or "coming soon" routes for these.

### 2. Stage 0 — Scaffold

- Next.js (latest stable, App Router) + TypeScript strict + Tailwind CSS + shadcn/ui. Initialise shadcn and add **only** the components the page actually uses (likely just `Button`; do not install the whole set).
- ESLint + Prettier. `npm run lint` and `npm run build` must pass.
- Supabase: `supabase init`, local Supabase for development, migrations in `supabase/migrations/`.
- Env handling: `.env.example` listing names only (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`). Use `NEXT_PUBLIC_*` only for values safe in the browser. `.env*` git-ignored.
- `git init`, sensible `.gitignore`, first commit.
- **No new dependencies beyond the above** without justifying them under CLAUDE.md §2. In particular: no animation library, no icon pack beyond what shadcn already brings (`lucide-react` is fine), no form library, no state library, no analytics.

Suggested structure (keep it this flat unless there's a reason):

```
src/
  app/
    layout.tsx            fonts, metadata, global shell
    page.tsx              the landing page (composes sections)
    privacy/page.tsx
    terms/page.tsx
    sitemap.ts
    robots.ts
    opengraph-image.tsx   (or a static OG image in /public)
    globals.css           CSS variables for the design tokens
  components/
    landing/              one file per section (hero.tsx, how-it-works.tsx, ...)
    ui/                   shadcn primitives actually used
  lib/
    fees.ts               fee constants used for display only (see §6)
    supabase/server.ts    server client for the waitlist action
supabase/
  migrations/             waitlist table + RLS
```

### 3. Design direction — "warm, playful, trustworthy"

The reference design (`docs/design-inspiration-clay.md`) shows a **cream canvas, near-black ink, big friendly rounded display type, generous corner radii, and saturated single-colour feature cards that contain small fragments of the real product UI**. Take that *approach*; build Pitchype's own identity.

**Take (inspiration):**
- Warm cream page background instead of cool white or grey.
- Near-black primary buttons, 12px radius, 44px minimum height.
- Large, tight, rounded display headlines; calm Inter body text.
- Rows of saturated colour cards (24px radius), cycling colours so the same colour never appears twice in a row.
- Small product UI "fragments" inside cards to show the product instead of describing it.
- Cream footer, not a dark one. Generous section spacing (~96px desktop, ~64px mobile).
- Almost no shadows; depth comes from colour contrast.

**Do NOT copy:**
- Clay's name, logo, copy, mascot characters, mountain/claymation illustrations, or the proprietary "Plain Black" typeface. Nothing on the page may look like a Clay screenshot recoloured.
- Their exact colour hexes. Use Pitchype's palette below.

**Pitchype palette (CSS variables, expose to Tailwind):**

| Token | Value | Use |
|---|---|---|
| `canvas` | `#FFF9EE` | Page background |
| `surface-soft` | `#FBF3E2` | Footer, CTA band, hero card |
| `surface-card` | `#F4EBD6` | Cream cards, testimonial-style cards |
| `ink` | `#121212` | Headlines, primary buttons |
| `body` | `#3A3A3A` | Running text |
| `muted` | `#6B6B6B` | Secondary text (check contrast on canvas) |
| `hairline` | `#E8E0CC` | 1px borders |
| `brand-green` | `#0F3D2E` | Deep green card, featured emphasis (nod to Nigeria), white text OK |
| `brand-coral` | `#FF6B57` | Coral feature card, accents |
| `brand-lilac` | `#C9B8FF` | Lilac feature card |
| `brand-sun` | `#FFC93C` | Sun-yellow feature card |
| `brand-peach` | `#FFB48A` | Peach feature card |
| `brand-mint` | `#A9E0C8` | Mint feature card, small badges |

**Contrast rules (non-negotiable):** every text/background pair must meet WCAG AA (4.5:1 body, 3:1 large text). Use **dark ink text on coral, lilac, sun, peach and mint**; use white text only on `ink` and `brand-green`. Check the values with a contrast calculation and adjust a hex slightly if a pair fails. Don't just trust the table above.

**Typography:** load via `next/font/google` (self-hosted, no layout shift, subset to Latin).
- Display: **Bricolage Grotesque** (or another free rounded/characterful grotesque if it doesn't render well), weight 600, tight negative letter-spacing on large sizes, line-height ~1.05.
- Body/UI: **Inter**, 400/500/600.
- Display scale roughly 56–72px desktop, 36–44px mobile for the hero; fluid via `clamp()`. Never go heavier than 700.

**Illustration (no stock photos, no real people):**
- Build original, simple, playful shapes in inline SVG/CSS: soft blobs, stacked rounded shapes, sticker-like badges, a stylised phone frame, speech bubbles, coin/wallet motifs. A friendly "clay-ish" feel through soft gradients and inner highlights is welcome, but keep SVGs lightweight.
- Creator avatars are initials on coloured circles or simple SVG faces. **Never use photos of real people or public figures.**
- Product fragments (campaign card, application card, escrow timeline, wallet balance) are built in HTML/CSS with **clearly fictional sample data** and a tiny "Sample" tag.
- Hero illustration may be swapped later for generated art; structure it as a self-contained component so replacing it is trivial.

**Motion:** subtle only (hover lifts, a gentle float on hero shapes, fade/slide-in on scroll via CSS/`IntersectionObserver` if truly needed). Everything must respect `prefers-reduced-motion`. No animation libraries.

### 4. Page structure and copy

Tone: warm, plain-spoken, confident, a little playful. Written for Nigerian businesses and creators, in clear English, with light local flavour only where natural (₦ amounts, Lagos/Abuja/Port Harcourt examples). No hype clichés, no buzzword soup, no "revolutionary". Short sentences.

**Hard rule:** do **not** invent statistics, user counts, ROI numbers, customer logos, testimonials or press mentions. Pitchype has no users yet. If a section would normally show social proof, replace it with something true (the waitlist, how escrow works, the fee table).

Sections, in order:

1. **Top nav** (64px, cream, sticky): wordmark "pitchype" (simple text logo in the display font, plus a small playful mark), links (How it works, For businesses, For creators, Pricing, FAQ), primary button "Join the waitlist". Hamburger below 768px with an accessible menu.

2. **Hero** (7/5 split on desktop, stacked on mobile):
   - Headline (pick the best, or write a better one): *"Brands meet creators. Everybody gets paid."*
   - Sub-headline: *"Post a campaign, choose the creators you like, and pay safely through escrow. Creators apply, do the work, and get paid when it's approved."*
   - Two CTAs: **"I'm a business"** (primary, ink) and **"I'm a creator"** (secondary). Both scroll to/prefill the waitlist form with the right role.
   - Under the buttons: a single reassurance line, e.g. "Free to join. You only pay when a job is funded." Keep it true to the fee model.
   - Right side: original illustration card (phone frame with a campaign card and a ₦ escrow chip floating beside it).

3. **"Built for micro and nano creators"** short band: one paragraph on why small creators (a few thousand to ~100k followers) convert well and are affordable, plus 3 small icon-led points (Affordable, Authentic, Local). No numbers unless sourced.

4. **How it works** with a **Business | Creator toggle** (the one client-side island on the page; default Business):
   - Business: 1 Post a campaign → 2 Review applications → 3 Approve & fund escrow → 4 Approve the work → creator is paid.
   - Creator: 1 Create your profile → 2 Find and filter campaigns → 3 Apply (or negotiate a price) → 4 Deliver, get approved, get paid.
   - Each step is a numbered card with a small product fragment. Mobile: horizontal-snap or vertical stack, whichever reads better.

5. **Feature cards** (saturated colour grid, 3-up desktop / 2-up tablet / 1-up mobile, colours cycling coral → green → lilac → sun → peach → mint with no repeats back-to-back). Each has a title, one-sentence benefit and a product fragment:
   - **Safe by default (escrow):** money is held until the work is approved. *(Wording note: say "held until work is approved". Do not claim to be licensed, regulated, "bank-grade", or "100% guaranteed".)*
   - **Find the right creators:** filter by niche, platform, location, followers, price.
   - **Chat and negotiate:** agree a price and details before you start.
   - **7-day auto-release:** if a business doesn't respond to submitted work in 7 days, the creator is paid automatically.
   - **Clear approvals:** accept the work or decline with reasons; no silent rejections.
   - **Simple wallet and payouts:** earnings land in your wallet; cash out to your bank, with any transfer fee shown upfront.

6. **Two-audience split** ("For businesses" / "For creators"): two large cards side by side, each with 4 bullets and its own CTA (links to the waitlist with role prefilled). Anchor ids `#for-businesses` and `#for-creators`.

7. **Pricing: "Simple, honest fees"** (anchor `#pricing`):
   - Businesses: **5% service fee on top** of the agreed price. Example: "₦50,000 job → you pay ₦52,500".
   - Creators: **5% fee on what you earn.** Example: "₦50,000 job → you receive ₦47,500."
   - "No monthly fees. No fee to join. Payout transfer fee (a few naira) is shown before you confirm."
   - Read the percentages from `src/lib/fees.ts` (display-only constants) and compute the example amounts in code so the page never drifts from the numbers in CLAUDE.md §6.1. Do not hardcode ₦52,500 / ₦47,500 in JSX.
   - Do **not** mention refund/cancellation rules on the landing page. They belong in the Terms, later.

8. **FAQ** (anchor `#faq`): 7–8 questions using native `<details>/<summary>` (no accordion dependency). Cover: What is Pitchype? Who can join? How does escrow work? When do creators get paid? What if a business doesn't respond? What does it cost? Can I negotiate a price? Is it live yet? (honest answer: launching soon; join the waitlist). Keep answers short and true. No legal promises.

9. **Waitlist CTA band** (`#waitlist`, `surface-soft`, 24px radius): headline *"Be first in when we open the doors."*; form with email input, a two-option role selector (Business / Creator, accessible radio group styled as pills), submit button; success and error states; honest microcopy about what the email is used for, linking to `/privacy`.

10. **Footer** (cream): wordmark, short blurb, link columns (Product anchors, Legal: Privacy, Terms), "© <year> Pitchype". Contact email as a placeholder (`hello@pitchype.com`, clearly one to confirm).

### 5. Waitlist implementation

- Supabase table `waitlist`: `id uuid pk default gen_random_uuid()`, `email text not null`, `role text not null check (role in ('business','creator'))`, `created_at timestamptz not null default now()`, `source text` (optional). **Unique index on `lower(email)`**.
- **RLS enabled.** Policy: anonymous role may `INSERT` only. No `SELECT`, `UPDATE` or `DELETE` for anon. Prove this with a test or a documented manual check using the anon key.
- Submit via a **Server Action** (no separate API route). Server-side: trim and lowercase the email, validate format and role, reject anything else. Duplicate email → friendly "You're already on the list" (not an error).
- **Spam protection without new dependencies:** a hidden honeypot field and a minimal per-IP rate limit (keep it simple; an in-memory limiter is acceptable at this stage, note its limits in a comment). Don't add a captcha yet.
- Never expose the service-role key to the client, and the waitlist action doesn't need it.
- Return a typed result (`{ ok: true } | { ok: false, message }`); show the message inline with `aria-live="polite"`.
- Works without JavaScript if feasible (progressive enhancement); otherwise degrade gracefully.

### 6. Fees file

`src/lib/fees.ts` exports plain constants (e.g. `BUSINESS_FEE_RATE = 0.05`, `INFLUENCER_FEE_RATE = 0.05`, `MIN_FEE_NGN = 500`) and a tiny pure function to compute the sample example from an agreed price. Include a unit test that the ₦50,000 example yields ₦52,500 / ₦47,500. Comment that these mirror CLAUDE.md §6.1 and that real money maths later will live in the database `fee_config` (this file is display-only).

### 7. Quality bar

- **Mobile first.** Design and test at 360px, 390px, 768px, 1024px, 1440px. Most visitors will be on phones and mid-range Android over variable networks.
- **Performance:** target Lighthouse mobile ≥ 90 (Performance), ≥ 95 (Accessibility, Best Practices, SEO). Mostly Server Components; ship minimal JS (the toggle and the form are the only client code). Optimise images (`next/image`), prefer SVG/CSS over bitmaps, no autoplay video, no heavy fonts (subset, `display: swap`).
- **Accessibility:** semantic landmarks, one `h1`, logical heading order, visible focus rings, keyboard-operable nav/toggle/form, labels on every input, `aria-live` on form status, sufficient contrast, tap targets ≥ 44px, `prefers-reduced-motion` honoured.
- **SEO/social:** title, description, canonical, Open Graph and Twitter card (generated or static OG image), `lang="en"`, JSON-LD `Organization` (name + url only; nothing invented), sitemap and robots.
- **Code quality:** follow CLAUDE.md §2 strictly. One file per landing section, plain components, no speculative abstractions, no generic "Section" framework. Extract a shared piece only if used three or more times. Comments explain *why*.
- **Copy quality:** read every line aloud. No lorem ipsum, no filler, no fake numbers.

### 8. Verification (do all of this before saying you're done)

1. `npm run lint`, type-check, unit test and `npm run build` pass.
2. Apply migrations on a clean local Supabase (`supabase db reset`) and test the waitlist: valid signup, duplicate signup, invalid email, bad role, honeypot filled, and attempt a `SELECT` with the anon key (must fail).
3. Run the site and take screenshots at 360, 768 and 1440px; actually look at them and fix layout problems (overflow, awkward wraps, colour pairs that fail contrast).
4. Run Lighthouse (mobile) and report the scores.
5. Check keyboard navigation and the reduced-motion behaviour.
6. Tell me plainly what you verified and what you couldn't.

### 9. Deliverable and hand-off

- Everything committed in small, well-named commits.
- A short `README.md` (replace the old Pitchype README content, which described a different, older approach): what Pitchype is, how to run locally, env vars, how to apply migrations, how to deploy to Vercel. No marketing stats.
- A list of: decisions you made that I should review (copy, palette tweaks, fonts), anything you deliberately left out, and anything that needs my input (domain, contact email, privacy/terms review, Supabase project creation, Vercel project creation).

### 10. Working rules for this build

- Ask before adding any dependency not listed in §2, and before touching anything outside this stage's scope.
- Don't invent facts about the business (users, partners, licences, funding).
- If you hit an ambiguity that changes behaviour, ask; if it only changes taste, choose the simpler option and tell me.

## END OF PROMPT

---

## Roadmap — the stages that follow (one prompt each, written when we get there)

| Stage | Goal | Notes |
|---|---|---|
| 1 | Landing page + waitlist (this prompt) | Collect emails, prove demand |
| 2 | Auth + onboarding | Supabase Auth, roles (business / influencer / admin), profile setup, RLS foundation |
| 3 | Creator profiles + discovery | Public profiles, filters (niche, platform, location, followers, price), SEO directory |
| 4 | Campaigns | Create, publish, list, filter, slots and eligibility rules |
| 5 | Applications + chat | Apply with optional price, business review, approve, in-app messaging |
| 6 | Money: escrow, wallets, payouts | Paystack, ledger, fee rules from CLAUDE.md §6, webhooks, `pg_cron` auto-release (highest-risk stage; heavy testing) |
| 7 | Submissions, approvals, disputes | Completion flow, denial with reasons, admin dispute tools |
| 8 | Notifications + paid features | Email via Resend, in-app alerts; later featured placement and alert subscriptions |
| 9 | Hardening and launch | Security review, load and reconciliation checks, legal review, monitoring, Vercel Pro + Supabase Pro switch |
