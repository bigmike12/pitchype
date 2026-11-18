# Audience pages: `/for-business` and `/for-creators`

Date: 2026-11-18. Status: draft for approval.

## Intent and why

Pitchype starts as a middle-man between businesses and micro/nano creators. It is meant to grow into two products: a marketing management platform for businesses, and a business management tool for creators. The first planned addition is a UGC flow with its own journey, but UGC is **not** part of this work.

Today one homepage explains everything for both sides. As products arrive it would get longer and vaguer. The owner wants the public site to separate the two audiences now, so each side has a place to learn in depth what Pitchype does for it, and so people notice upgrades on their own side as they ship.

So: two in-depth pages, one per audience, with the homepage kept as the general front door. Someone who arrives at sign-up from an audience page is not asked "business or creator?" again.

## Goals

- `/for-business` and `/for-creators`: each a full, honest, in-depth page for that audience, built only from what exists today (campaigns, directory, hiring board, chat, escrow, review and auto-release, disputes, wallet, payouts).
- The homepage stays, as a shorter front door with a clear way into each page.
- Sign-up skips the account-type question whenever the visitor has already said which side they are on.
- Each page is findable: its own title, description, canonical URL and a sitemap entry.
- Adding a product later (UGC first) means adding a section or sub-page under the right audience, not reworking the structure.

## Non-goals

- UGC, or any unbuilt feature, in copy or structure. No placeholder sections for the future.
- A third account type or any change to the one-role-per-account rule (CLAUDE.md §12).
- A page-template or content-config framework. Two hand-written pages.
- New fonts, new dependencies, new tokens, pricing or fee changes.
- Any change to the signed-in portal at `/business/...`.

## Anti-goals (would be a failure even if it technically works)

- Pages that read as the homepage with a filter on top: same copy, same calculators in two places.
- Copy that promises something not built, or numbers nobody verified (CLAUDE.md §3: never ship unverified statistics; §6: no legal claims about escrow).
- Someone creating a business account by accident because the picker is hidden. The role cannot be changed later, so hiding the picker must still show clearly which account is being created, and offer a way to switch.

## Constraints

- Existing rules apply: design system and tokens only, CSS-only motion under `motion-safe`, skeleton and 390px checks, mobile first, no new dependencies (CLAUDE.md §2, §4a; `docs/DESIGN_SYSTEM.md`).
- Marketing pages stay static and prerendered, under the existing `(marketing)` layout (floating glass header, triangle cursor). `/for-business` and `/for-creators` do **not** collide with the proxy's signed-in prefix `/business`: the proxy matches whole path segments, and these paths are not in its matcher, so they stay static.
- `/creators` (the public directory) and `/business/...` (the portal) are unchanged and must not be confused with the new URLs.
- Existing anchors `/#for-creators` and `/#for-businesses` may be linked from outside (social bios, emails). Keep landing on the right place.
- Fee figures come from `src/lib/fees.ts`, as the existing pricing section does.

## Approaches considered

1. **Add the pages, leave the homepage alone.** Least work. The calculators and stats would then live in two places, the homepage stays long, and the separation is cosmetic. Rejected.
2. **Add the pages and move the per-audience depth into them (chosen).** The homepage becomes a front door; the pages hold the detail. When UGC arrives it adds a section to an audience page and a line on the homepage.
3. **Make the homepage a pure chooser.** Cleanest split, but `/` would give search engines and first-time visitors almost nothing and would lose the shared argument. Rejected.

Also decided: **two plain page files that compose existing landing components**, rather than one `AudiencePage` template driven by config. Two uses don't justify the layer, and UGC may not fit its shape (CLAUDE.md §2). URL names `/for-business` and `/for-creators` were chosen over `/business` and `/creator` because `/business` is the portal prefix and `/creator` sits next to `/creators`. Both the approach and the URLs were chosen by the owner.

## Design

### Pages

Each page lives in `src/app/(marketing)/for-business/page.tsx` and `.../for-creators/page.tsx` and composes sections from `src/components/landing/`. Planned sections (order is a guide; the builder may adjust for flow):

```
/for-business                       /for-creators
 hero + signup CTA                   hero + signup CTA
 why (the problem it solves)         why
 how it works (business steps)       how it works (creator steps)
 finding & hiring creators           finding campaigns & applying
 escrow: how your money is held      getting paid: escrow, 7-day auto-release
 pricing + budget splitter           fees + earnings calculator + payouts
 outside stats                       outside stats
 business FAQ                        creator FAQ
 closing CTA                         closing CTA
```

Content must be true of the product as built. Material available (all built): campaign creation with structured deliverables and requirements, the creator directory and its filters, "verified creators only", applications and proposed prices, chat, the hiring board, paying into escrow (48 hours to pay after approval), submission with proof, review with denial reasons and up to 3 resubmissions, the 7-day review window with auto-release, disputes decided by an admin, refunds to the business wallet, the creator wallet, payouts (₦1,000 minimum, transfer cost shown first, admin-approved), creator profiles and bio-code verification, email notifications. Not built, so not mentioned: pay-per-click, wallet top-ups, wallet withdrawal to a bank for businesses, UGC.

### Homepage after the change

Keeps: hero, creators band, why Pitchype, how it works (tabs), pricing, FAQ, closing CTA. The two long audience sections (`ForCreators`, `ForBusinesses`, with their calculators and stats) are replaced by a short two-card split: one card per audience with a line or two and a button to its page (and the existing "I'm a business / creator" sign-up buttons stay in the hero and closing CTA). The two cards carry `id="for-creators"` and `id="for-businesses"` so old anchors still land there. The calculators and the stats grids move to the audience pages. The bento `Features` section is split or kept by the builder according to which side each tile is about; tiles that serve both stay on the homepage.

### Sign-up

- A valid `?role=` on `/signup` (already produced by the homepage buttons and by the new pages) means the role is known. The form then does not show the two-card picker. It shows a clear line such as "Signing up as a creator" with a "Change" link to plain `/signup`, and submits the role as a hidden field. The page heading line ("Tell us how you'll use Pitchype") becomes role-specific or neutral as the builder sees fit.
- Plain `/signup` (header button on the homepage, direct visits) still shows the picker.
- The server action keeps validating the role as it does today (`isSignupRole`); a missing or invalid role is still an error. Nothing about the account model changes.

### Navigation

- Header: "For creators" and "For businesses" link to the new pages instead of homepage anchors. Other links stay root-relative so the header works on every marketing page.
- Header "Get started": on `/for-business` it goes to `/signup?role=business`, on `/for-creators` to `/signup?role=influencer`, elsewhere to `/signup`. This needs a small client piece reading the pathname; the header and mobile menu stay otherwise as they are.
- Footer "Product" links updated the same way.

### Metadata and indexing

Each page sets its own title, description and `alternates.canonical`. Both URLs are added to `src/app/sitemap.ts` with the homepage and directory. The homepage's description should still make sense now that depth has moved off it.

## Calls made while writing this up (not the owner's; change any of them)

- **What is canonical where.** The homepage keeps the short, two-sided versions: the "How it works" tabs (4 steps per side), and Pricing with both fee receipts (figures from `src/lib/fees.ts`, so no copy drift). It loses the two calculators and the outside-stat grids. Each audience page gets its own, deeper version for that side only: its own step list (reusing the existing step components, with more detail than the tab summary), its own receipt plus its calculator, its own stats and FAQ. The same fee numbers appearing on both is fine; the same paragraphs and the same calculators are not.
- **Outside stats are already sourced.** Every figure in `src/components/landing/stats.tsx` has a linked public source and a check date (2026-11-10), and the existing footnote says they are global or US figures. They move with the calculators, with that footnote, and need no new verification. Any figure added later needs a source (CLAUDE.md §3). If a page ends up with no stat worth showing, drop that section rather than pad it.
- **`?role=` handling.** An invalid or missing value falls back to the picker (today's behaviour). The role is kept across a failed submission because the page URL keeps `?role=` and the hidden field is rendered from it every time. Going to `/login` and back needs no special handling. The "Signing up as a creator" line is plain visible text inside the form (not a small caption), with a text "Change" link; it is not dismissable.
- **Header CTA scope.** Role-aware on the two new paths only. `/creators` and the profile pages keep plain `/signup`. Footer CTAs are not made role-aware; only its "Product" links change.
- **Old anchors.** `/#for-creators` and `/#for-businesses` land on the split cards, which link onward. No hash redirect script (it would add client JavaScript for little gain).
- **Out of scope:** per-page Open Graph images (the shared one applies), FAQ structured data, and analytics events (PostHog is used only for server error reports today; there is no click tracking to extend).

## Left to the builder

Exact section copy and headlines (within the truth constraints above); whether a section is reused as-is, given a new prop, or newly written; the business and creator FAQ questions (drawn from the existing general FAQ plus what each side asks); how the homepage split cards look within the design system; the split of the bento `Features` tiles; whether the sign-up heading text changes; where the pathname-aware CTA lives.

## Verification

Lint, type-check and the existing tests pass; `next build` prerenders both pages statically. In a browser, at 1440px and 390px: homepage, both new pages, `/signup` plain and with each `?role=`, the "Change" link, the header CTA on each page, old `/#for-creators` anchors. Signing up through the role-fixed form creates the right kind of account (or say plainly that this was not exercised). `docs/TODO.md` updated: tick off anything done, and list deferred work (for example, UGC sections when that ships).
