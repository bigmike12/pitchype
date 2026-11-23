# Creator Discovery & Portfolio: Architecture

Status: approved for build, 2026-11-23. Redesigns the Stage 3 public directory
(`/creators`) and profile (`/creators/[slug]`) into a discovery page and a
shareable creator portfolio, and adds portfolio media, sharing, track record and
sorting. Where this differs from `docs/creator-directory-decisions.md`, this
document wins; update that doc and CLAUDE.md §12 in the same change.

## 1. Owner decisions (2026-11-23)

1. **Bio is public.** Signed-out visitors now see the bio. Handles, links to
   social profiles, the starting rate and the price filter stay for businesses
   and admins only, enforced in the database as before. Bios are already
   contact-checked on save (`findContactDetails` in `src/lib/creator-profile.ts`).
2. **Portfolio media is built:** one cover image plus up to **6 work samples**
   (image, caption, optional link to the original post). Server-processed with
   sharp like the profile photo. Admins can take a sample or a cover down.
3. **Track record:** a public count of completed Pitchype jobs and "on Pitchype
   since". Real numbers only; the count is hidden when zero.
4. **Sorting:** newest (default, today's order), most followers, verified first.
5. **Handle search:** signed-in businesses and admins can search by @handle.
   Searches by anyone else never match handles, so a search can't reveal one.

Rules that do NOT change: profiles are hidden until published; `allow_indexing`
opt-out; admin hiding (`hidden_reason`); one public URL per creator,
`/creators/[slug]`; no invented statistics (§3, §4a); no engagement-rate or
analytics claims (we don't have that data).

## 2. What is public vs gated

| Field | Signed out / creator | Business, admin | Source |
|---|---|---|---|
| Display name, photo, city/state, niches | yes | yes | `listed_creators` |
| Bio | **yes (new)** | yes | `influencer_profiles.bio` |
| Platforms + follower range / verified count | yes | yes | `creator_platforms_json` |
| Handles, profile links | no | yes | `creator_platforms_json(…, details)` |
| Starting rate, price filter, price sort | no | yes | |
| Cover image, sample images, captions | **yes (new)** | yes | `portfolio_samples`, `cover_version` |
| Sample `post_url` | **no**: a post URL reveals the handle | yes | |
| Completed jobs count, member since | **yes (new)** | yes | derived from `engagements`, `users` |
| `user_id` | never sent to the browser on public pages | portal only | |

Never public: email, exact follower history, rates, applications, earnings,
wallet, strikes/moderation, verification codes, `hidden_reason`.

`getListedCreator()` returns `userId`; keep it on the server. Don't pass it to
client components on the public page and don't render it.

## 3. Data model (one new migration, plus types regenerated)

All changes in `supabase/migrations/2026112310xxxx_creator_portfolio.sql` (split
into two or three files if it reads better). Never edit an applied migration.

### 3.1 `influencer_profiles.cover_version integer null`
Same pattern as `photo_version`: only the server (secret key, through
`lib/db/creators.ts`) writes it; creators can't. Add it to whatever column-level
grant/trigger currently protects `photo_version` from creator writes.

### 3.2 `portfolio_samples`
```
id              uuid pk default gen_random_uuid()
user_id         uuid not null references users(id) on delete cascade
position        smallint not null check (position between 0 and 5)
image_version   integer not null          -- file name versioning, like photos
caption         text null check (char_length(caption) between 1 and 140)
platform        social_platform null      -- where the work ran
post_url        text null check (post_url ~ '^https://')
hidden_at       timestamptz null          -- admin takedown
hidden_reason   text null
hidden_by       uuid null references users(id)
created_at, updated_at timestamptz
unique (user_id, position)
```
- **Cap of 6** enforced in the database (a before-insert trigger that locks the
  creator's `users` row and counts), not only in the UI.
- RLS on, default deny. The creator may select/insert/update/delete their own
  rows, but not `hidden_*` or `image_version` (server-only, like `photo_version`;
  write those through the secret-key client in `lib/db/`). Admins read all.
  Nobody reads other creators' rows directly; public reads go through §3.4.
- Caption is contact-checked in app code before save (same helper as the bio);
  add a database check too if the dispute contact check
  (`20261117100900_dispute_contact_check.sql`) has a reusable SQL function.
- `post_url`: https only, host must match the chosen platform
  (instagram.com, tiktok.com, youtube.com/youtu.be, x.com/twitter.com). Validate
  in `src/lib/creator-profile.ts` (pure, unit-tested).
- Admin takedown: `hide_portfolio_sample(id, reason)` and
  `clear_cover(user, reason)` security-definer functions (admin only, checked
  inside), each writing a `moderation_events` row like the existing profile
  hiding. Reports on a profile (the existing report form) are how admins hear
  about it; add "a photo" as a report reason only if the form has reasons.

### 3.3 Storage
Reuse the public `profile-photos` bucket (no new bucket, so `PROVIDERS.md` only
gains a line about the new paths). Paths, versioned so URLs never change content:
- cover: `{userId}/cover-{version}.webp`, cropped to **1600×900**, WebP ~80%
- sample: `{userId}/sample-{sampleId}-{version}.webp`, longest side **1200**,
  aspect kept, WebP ~80%
Generalise `processProfilePhoto` in `src/lib/profile-photo.ts` only as far as
needed (a size/crop argument), keeping its checks: real-type sniffing, EXIF
stripped, `MAX_INPUT_PIXELS`, 5 MB cap, browser-side downscale before upload
(Vercel's 4.5 MB body limit). Check the bucket's `file_size_limit` and
`allowed_mime_types` still fit. Delete the old object when a version is replaced
or a sample is removed. URL helpers live in `src/lib/storage.ts` beside
`profilePhotoUrl`.

### 3.4 Database functions (drop and recreate; signatures change)
- `get_listed_creator(creator_slug)`: return `bio` regardless of viewer; add
  `cover_version`, `completed_jobs integer`, `member_since timestamptz`.
- `creator_portfolio(creator_slug)` (new, security definer, `anon` +
  `authenticated`): the visible samples of a **listed** creator, ordered by
  `position`, excluding `hidden_at is not null`; `post_url` is null unless
  `viewer_sees_creator_details()`.
- `search_creators(…, sort text default 'newest')`: add `bio` (for card
  excerpts) and `cover_version` to the output; `sort` in
  `newest | followers | verified` (anything else raises); stable tiebreak on
  `user_id`. `followers` orders by the creator's highest `effective_range`
  (verified counts beat ranges at equal tier); `verified` puts creators with any
  verified platform first, then newest. **Handle search:** when
  `viewer_sees_creator_details()`, the pattern also matches
  `influencer_platforms.handle` (strip a leading `@` from the search); otherwise
  it never does.
- Completed jobs = engagements of that creator whose status is `accepted` or
  `auto_released` **and** `released_kobo > 0` (a per-click hire with zero clicks
  settles as `refunded`, so it's excluded anyway; the guard keeps a zero-release
  out). `member_since` = the profile's first publish if stored, else
  `users.created_at`. Don't add a column for it if one exists.
- `indexable_creators()`: unchanged unless lastModified should consider sample
  changes (then use `greatest(profile.updated_at, max(sample.updated_at))`).

### 3.5 pgTAP: `supabase/tests/creator_portfolio.test.sql`
At least: anon gets bio, null handles, null `post_url`; business gets both;
hidden samples and samples of unpublished/hidden creators never returned; the
7th sample is refused, including two inserts at once (add a `money-race`-style
scenario only if cheap; a pgTAP check with the lock is enough); a creator can't
write `image_version`, `hidden_*` or another creator's rows; anon search for a
handle matches nothing while a business's matches; `sort` values and the
invalid-sort error; completed-jobs counts only released hires; rate filter still
refused for anon.

## 4. App architecture

Data access stays in `src/lib/db/creators.ts` (plain functions, viewer's
session). Add `getCreatorPortfolio(slug)` (memoised with `cache()` like
`getListedCreator`), the sample CRUD functions, and `setCoverVersion`. Extend
`CreatorCard`/`CreatorPage` types. Validation in `src/lib/creator-profile.ts`
(`parseDirectoryFilters` gains `sort`; `directoryQuery` keeps it in the URL).

### 4.1 Routes

```
src/app/(marketing)/creators/
  page.tsx                  discovery page (redesign); Suspense → skeleton
  loading.tsx | skeleton    shaped like the page (§4a: no "Loading…" text)
  error.tsx                 friendly retry state (client component)
  [slug]/
    page.tsx                portfolio page (redesign); skeleton fallback
    opengraph-image.tsx     dynamic 1200×630 card per creator (new)
    not-found.tsx           "This profile isn't public" + link to directory
    actions.ts, report-form.tsx   (existing, keep)
src/app/(portal)/(influencer)/profile/
    page.tsx                gains: cover upload, samples manager, "Your public
                            page" card with the share button and a preview link
src/app/(portal)/(admin)/…  takedown buttons where admins already hide profiles
src/app/(portal)/(business)/business/creators/[slug]/page.tsx
                            reuses the portfolio components so businesses see
                            the same page plus their actions (message, hire)
```

The public URL stays `/creators/[slug]`. It's already short and clean; no
`/@slug` alias (one canonical URL, §2).

### 4.2 Components (`src/components/creators/`)
Redesign in place rather than forking: `directory.tsx`, `directory-filters.tsx`,
`creator-card.tsx`, `creator-profile-view.tsx` are shared by the public pages
and the business portal, so the portal pages must keep working (portal density
can differ via the existing `basePath`/`inPortal` switch). New:
- `portfolio-gallery.tsx`: samples, an accessible lightbox via shadcn `dialog`
  (`npx shadcn@latest add dialog` if not present; restyle to tokens, document in
  `DESIGN_SYSTEM.md`). Keyboard and screen-reader complete.
- `share-profile-button.tsx` (client): `navigator.share` when available, else
  copy to the clipboard; feedback through the existing toast if there is one,
  otherwise an `aria-live` message. Shares the canonical
  `${SITE_URL}/creators/${slug}` with no tracking params.
- `track-record.tsx`, `cover-image.tsx`, the samples manager form for the
  creator's portal.

Server Components by default; client only for share, the lightbox, filter
controls that need it, and the upload forms.

### 4.3 Server Actions (creator portal)
`uploadCover`, `removeCover`, `addSample`, `updateSample` (caption, platform,
post_url, position), `removeSample`, `reorderSamples`. Each: authenticate →
role `influencer` → validate (type, size, caption contact check, URL host) →
act through `lib/db/creators.ts` → `revalidatePath` for the creator's public
page. Rate-limit uploads with the existing `lib/db/rate-limits.ts` pattern.

### 4.4 SEO and sharing
- `generateMetadata` (profile): title `"{name}: {niche} creator in {city}"`,
  description from the bio (trimmed to ~155 chars), falling back to today's
  sentence; canonical; `robots` respects `allowIndexing`; `openGraph`
  `type: "profile"`; `twitter: { card: "summary_large_image" }`. The OG image
  comes from `opengraph-image.tsx`, so remove the photo-only `images` entry.
- `opengraph-image.tsx`: name, niches, city, platforms with follower ranges,
  verified mark, photo (or the cover), Pitchype wordmark, in the porcelain/aurora
  look with Bricolage + Inter loaded from local font files. **Satori can't
  decode WebP**: fetch the stored WebP and convert it with sharp to PNG/JPEG
  (or a data URL) before rendering. For unlisted slugs, render a generic
  Pitchype card instead of throwing. Sharing works even when `allow_indexing`
  is off (it only stops search engines).
- Directory metadata: keep the canonical `/creators` for filtered views; add
  twitter card; the root `opengraph-image.tsx` covers it, or add a directory
  one if the design calls for it.
- JSON-LD (`ProfilePage` → `Person`): add `description` (bio), `knowsAbout`
  (niche names), `image`, and `interactionStatistic` only for **verified**
  follower counts. No `sameAs` (it would publish the handles).
- Sitemap: unchanged apart from §3.4's lastModified.
- Semantic HTML: one `h1`, landmarks, `article` per creator card, `figure`/
  `figcaption` for samples, real `<a>` links for navigation.

## 5. Design brief (for `/design-taste-frontend` and `/impeccable`)

Run both skills before writing components. Work **inside** the existing
system: CLAUDE.md §4a and `docs/DESIGN_SYSTEM.md` are binding (fonts, tokens,
surfaces, CSS-only motion under `motion-safe`, 390px first, slow networks,
skeleton loading states, triangle cursor on marketing pages). Where the skills'
defaults conflict with the project's rules (new fonts, shader effects, stock
photographs, animation libraries), the project wins.

Goals:
- **Discovery** should feel editorial, not a database grid: a strong opening,
  search as the hero action, filters that stay out of the way on mobile (a
  sheet), and a creator layout with rhythm (sizes, covers and bios vary). A
  plain grid is allowed only if the critique pass shows it's the best option.
  Results stay paginated and URL-driven (shareable, crawlable).
- **Portfolio** should feel like the creator's own space: cover, photo, name,
  niches, bio, platforms with honest follower labels, samples, track record, a
  prominent Share, then the business call to action (sign up / message).
  Creators with no cover, no samples and a short bio must still look good;
  design the sparse case first.
- Both pages belong to the marketing shell and share one visual language.
- States: loading (skeletons), empty (no creators yet; no matches with a reset),
  error (retry), not found, a creator with nothing optional filled in.
- Images: `next/image` with explicit `sizes`, lazy below the fold, the profile
  photo `priority`; total page weight small enough for a 3G phone.

## 6. Docs to update in the same change
- `docs/creator-directory-decisions.md`: bio public, portfolio built, track
  record, sort, handle search.
- CLAUDE.md §12 (Stage 3 bullet) and §4 layout if a new folder appears.
- `docs/DESIGN_SYSTEM.md`: new components and the two page patterns.
- `docs/PROVIDERS.md`: the new storage paths.
- `docs/TODO.md`: anything deferred (e.g. automatic image moderation).

## 7. Verification before calling it done
`npm run lint`, type-check, unit tests, `supabase test db`; migrations replayed
cleanly (in a rolled-back transaction: **don't `supabase db reset`**, it wipes
the owner's local accounts); visual checks at 390px, 768px and 1280px, signed out
and as a business, with motion on and off; Lighthouse on both public pages; the
OG image rendered for a creator with and without a photo; a manual share and
copy on a phone-sized viewport. Nothing is pushed to the live Supabase project.
