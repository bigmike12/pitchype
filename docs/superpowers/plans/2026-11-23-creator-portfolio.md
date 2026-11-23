# Creator Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/creators` and `/creators/[slug]` into an editorial discovery page and a shareable creator portfolio, with cover, up to 6 samples, public bio, track record, sorting, business-only handle search, share button, per-creator OG image and better metadata.

**Architecture:** Visibility stays in the database (security-definer read functions decide per viewer). One new table (`portfolio_samples`), one new column (`cover_version`), new/recreated read functions. App reads through `src/lib/db/creators.ts`, files through `src/lib/storage.ts`, images through the sharp pipeline in `src/lib/profile-photo.ts`.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + Storage, pgTAP, node:test, sharp, Tailwind v4, shadcn/ui (dialog).

**Spec:** `docs/superpowers/specs/2026-11-23-creator-portfolio-design.md`

## Global Constraints

- Handles, profile links, sample `post_url`, rates and `user_id` never reach signed-out visitors or creators (enforced in SQL; verified with curl).
- Migration timestamps must sort after `20261126100000` (the local database already holds it and later out-of-tree versions up to `20261125…` from other branches); use `20261127100000` (moderation kinds) and `20261127100100` (portfolio). Never `supabase db reset`; apply with `supabase migration up`.
- Type regeneration: the local database also holds tables from other branches, so only this change's additions are copied into `src/types/database.ts`.
- Cover 1600×900 crop; sample longest side 1200; WebP q80; 5 MB input cap; `MAX_INPUT_PIXELS` unchanged.
- Max 6 samples, positions 0–5; caption 1–140 chars, contact-checked (app `findContactDetails`, DB `contact_detail_kind`).
- Sort values `newest | followers | verified`; anything else raises `22023`.
- Fonts Bricolage Grotesque 600 + Inter only; tokens only; CSS-only motion under `motion-safe`; skeleton fallbacks; 390px first.
- No new npm dependency; shadcn `dialog` added once and documented.

## Review Focus

1. Anon search for a string that is only a handle must return nothing (handle never leaks via matching). Test in Task 1.
2. A business-only `post_url` must not appear in a signed-out page's RSC payload. curl check in Task 5.
3. Two concurrent inserts at 5 samples: only one wins (lock on `users` row). Test in Task 1 (sequential check of the trigger; lock reasoning in comment).
4. Replacing a sample image / cover deletes the old object; removing a sample deletes its object. Covered by action code in Task 3; manual check.
5. OG image for an unlisted slug renders a generic card, and a WebP photo is converted with sharp before Satori. Checked in Task 6 by fetching the image route.

---

### Task 1: Database

**Files:** Create `supabase/migrations/20261127100000_portfolio_moderation_kinds.sql`, `supabase/migrations/20261127100100_creator_portfolio.sql`, `supabase/tests/creator_portfolio.test.sql`; modify `supabase/tests/creator_directory_rls.test.sql` (bio now public), `src/types/database.ts`.

**Produces:**
- `influencer_profiles.cover_version integer` (no creator grant).
- `portfolio_samples` per spec §3.2; creator column grants: insert `(user_id, position, caption, platform, post_url)`, update `(position, caption, platform, post_url)`, delete; select own rows; admins select all. Before-insert trigger locks `users` row and refuses a 7th (`P0001 'portfolio_full'`). Before-write trigger refuses contact details in caption (`P0001 'contact_details'`) and checks `post_url` host matches `platform`.
- `get_listed_creator(slug)` adds `bio` (always), `cover_version`, `completed_jobs integer`, `member_since timestamptz`.
- `creator_portfolio(slug)` → `(id, position, image_version, caption, platform, post_url)`; `user_id` not returned.
- `search_creators(..., search, sort text default 'newest')` adds `bio`, `cover_version`; handle match only for details viewers.
- `hide_portfolio_sample(sample uuid, reason text)` and `clear_cover(creator uuid, reason text)` (admin only; write `moderation_events` kinds `portfolio_sample_hidden` / `cover_removed`; `clear_cover` returns the old version so the app can delete the file).
- `indexable_creators()` lastModified = greatest(profile, max sample `updated_at`).

- [ ] Write `creator_portfolio.test.sql` with the spec §3.5 assertions; run `supabase test db` → fails (no table).
- [ ] Write the two migrations; `supabase migration up`; `supabase test db` → all pass (after updating the old bio assertion).
- [ ] Replay check: run both migration files inside `begin; … rollback;` against a database without them? Not possible without reset; instead confirm `supabase migration up` applied cleanly and that both files are idempotent-free (no `if not exists` shortcuts).
- [ ] Add the new types to `src/types/database.ts`; `npm run typecheck`.
- [ ] Commit `Add portfolio samples, cover and track record to the directory`.

### Task 2: Pure helpers and data layer

**Files:** modify `src/lib/creator-profile.ts` (+ test), `src/lib/profile-photo.ts` (+ test), `src/lib/storage.ts`, `src/lib/db/creators.ts`, `src/lib/db/reports.ts`.

**Produces:**
- `DIRECTORY_SORTS = ["newest","followers","verified"]`, `DirectoryFilters.sort`, `parseDirectoryFilters` reads `sort`, `directoryQuery` writes it when not `newest`.
- `parsePostUrl(platform: Platform | null, raw: string): {ok:true; url:string|null} | {ok:false; error:string}`; `parseSampleForm(form): Parsed<SampleInput, SampleField>` with `SampleInput = {caption: string|null; platform: Platform|null; postUrl: string|null}`.
- `processImage(input, kind: "photo" | "cover" | "sample")` behind `processProfilePhoto` (kept); sizes `COVER_WIDTH=1600, COVER_HEIGHT=900, SAMPLE_EDGE=1200`.
- storage: `coverUrl(userId, v)`, `sampleUrl(userId, sampleId, v)`, `saveCover/deleteCover`, `saveSampleImage/deleteSampleImage`.
- db: `getCreatorPortfolio(slug)` (cache), `listOwnSamples(userId)`, `createSample`, `updateSample`, `deleteSample`, `setSampleImageVersion` (secret key), `setCoverVersion` (secret key), `swapSamplePositions`, admin `hideSample`, `clearCover`, `listCreatorSamplesForAdmin`.
- [ ] Tests first for `parsePostUrl`, `parseSampleForm`, sort parsing, cover/sample sizes; implement; `npm test`; commit.

### Task 3: Creator portal management

**Files:** modify `src/app/(portal)/(influencer)/profile/{page.tsx,actions.ts}`; create `cover-form.tsx`, `samples-manager.tsx` there, `src/components/creators/share-profile-button.tsx`. Actions `uploadCoverAction`, `removeCoverAction`, `addSampleAction`, `updateSampleAction`, `removeSampleAction`, `moveSampleAction` (up/down = reorder). Shared browser shrink helper moved next to the forms (`shrink-image.ts`). Each: requireRole → rate limit (uploads) → validate → db → `refresh()` + `revalidatePath('/creators/'+slug)`. "Your public page" card with Share + View.
- [ ] Build, typecheck, exercise upload in a browser with an e2e creator; commit.

### Task 4: Admin takedown

Report item shows cover + samples with "Take down" (reason) and "Remove cover". Actions in `admin/actions.ts`. Commit.

### Task 5: Public pages

Design direction recorded below. Rewrite `directory.tsx`, `directory-filters.tsx` (sheet on mobile via `<details>`/native dialog, sort select), `creator-card.tsx`, `creator-profile-view.tsx`; new `portfolio-gallery.tsx` (shadcn dialog lightbox), `track-record.tsx`, `cover-image.tsx`; `loading.tsx`, `error.tsx`, `not-found.tsx`; business portal pages keep working. Verify signed-out HTML with curl for handle/user id. Commit.

### Task 6: SEO and OG

`generateMetadata` per spec §4.4; `[slug]/opengraph-image.tsx` (sharp WebP→PNG, local fonts, generic card when unlisted); JSON-LD additions. Commit.

### Task 7: Docs, verification, polish

Update the docs in spec §6; lint, typecheck, tests, `supabase test db`, local-env build, visual checks 390/768/1280 signed out + business + reduced motion; impeccable critique and fixes; commit.

## Design direction (set 2026-11-23 with design-taste-frontend and impeccable)

Refinement inside "porcelain and aurora", not a new world. Where the skills'
defaults conflicted with CLAUDE.md §4a (dealt palettes, stock photographs,
"never violet", shader grounds, their own starter kit and gate) the project
won; their principles were kept: show the real thing (the creators' own
photos and work), equal edges, hover that answers, one authored entrance, no
explanatory captions on pictures. Modes: discovery is Operate with a
Persuade opening; the portfolio is Experience (the creator's work leads, the
interface recedes).

**Discovery ("the index").** No aurora: a type-led masthead on the canvas.
A left-aligned `text-display-xl` h1, one line of truth (real listed count),
then search as the hero action (one large field + ink button). Under it, the
niche list set as an index in Bricolage (wrapping words on desktop, one
swipeable line on phones), each a link to that niche: the page's one type
moment. A slim toolbar follows: the real result count on the left, Sort and
(below 1024px) a Filters button that opens the remaining filters as a bottom
sheet; from 1024px the same fields sit inline. One `<form>` (GET) holds
everything, so every view is a URL. Results are an equal-width grid on
purpose: varying card sizes by position would read as paid prominence
(CLAUDE.md §10 fairness) and ragged rows break the sort order; rhythm comes
from content instead (a cover band with an overlapping portrait vs a full
portrait, a two-line bio excerpt). 1 column at 390, 2 from 640, 3 from 1024,
4 from 1280.

**Portfolio ("the creator's own space").** A cover band (`rounded-frame`,
16:9 on phones, ~2.6:1 from 1024px). With no cover, the band is a flat pastel
from the creator's own tone with their first name set huge in Bricolage
(ink on pastel): the sparse case is designed, not empty. The square photo
overlaps the band's bottom edge with a white ring; beside it the h1, place,
niches, then Share (secondary) and the business action. Below, two columns
from 1024px: About (bio at `text-xl`, 60ch), Work (samples, 2/3 columns,
4:5 tiles, figure + creator's caption, a dialog lightbox), Platforms; the
22rem aside holds the facts (jobs completed when > 0, on Pitchype since,
rate for businesses) and the call to action, sticky. One entrance (`enter`)
on the identity block; tiles zoom 1.02 on hover; everything still with
reduced motion.
