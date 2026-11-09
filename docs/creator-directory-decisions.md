# Creator Directory: Decisions

Status: adopted and built in Stage 3 (2026-11-09). This is the reasoning behind
the decisions. Where it differs from the built version, the Stage 3 section of
`docs/BUILD_PROMPT.md` and the code win. The decisions themselves are summarised
in CLAUDE.md §12.

## 1. Follower counts and ownership verification

**Decision:** two tiers. Self-reported at launch, upgraded to Verified through a bio-code check.

**Self-reported (default)**
- Creator enters a follower range per platform: 1K-5K, 5K-10K, 10K-50K, 50K-100K, 100K+.
- Ranges, not exact numbers. This keeps the followers filter simple and reduces pressure to inflate.
- Shown with a visible "self-reported" label and the date last updated.

**Verified (upgrade)**
- Pasting a public URL proves nothing: anyone can paste a large account's link. Ownership is proven with a code.
1. Pitchype issues a single-use code (e.g. `pitchype-7K3F9Q`) tied to user + platform + handle, expiring in about 48 hours.
2. Creator puts the code in their bio on that platform.
3. Pitchype confirms the code is present, records the follower count seen at that moment, and grants the badge.
4. Creator may remove the code afterwards.
- Badge reads "Verified" with "followers as of [date]". Ask creators to re-verify every few months.
- One verified Pitchype account per social handle. A second claim on an already-verified handle goes to a dispute review; the first claimer does not win by default.

**How the check runs (phased)**
- Launch: manual. An admin opens the profile, confirms the code, and records the count. This also fixes the follower count, which a bio code alone cannot do.
- Later: automate through official routes only. YouTube Data API (public, easy), TikTok Login Kit (can return follower stats), Instagram Graph API (needs a professional account and Meta app review).
- Do not scrape Instagram or TikTok server-side. They block it, markup changes often, and it breaks their terms.

**Table: `verification_requests`**
- id, user_id, platform, handle, code, status (pending / verified / rejected / expired), follower_count_seen, reviewed_by, reviewed_at, created_at, expires_at
- Unique constraint on (platform, handle) where status = verified.

## 2. Who can see the directory

**Decision:** public listing pages, with reduced detail for signed-out visitors.

- Signed out: display name, avatar, niches, city, platform icons, follower range.
- Signed in as a business: also handles, starting rate, and the contact/hire action.
- Gating the handles and rates gives businesses a reason to sign up. Gating the whole directory would make the site invisible to search and look empty at launch.
- Every profile is hidden until the creator chooses to publish it (draft / published state).
- Creators can opt out of search indexing (`noindex`) for their own page.

## 3. What a profile holds

- Display name and short bio
- Profile photo (one avatar, see below)
- Platforms (Instagram, TikTok, YouTube, X) with handles
- Follower range per platform, with self-reported / verified status
- One to three niches from the fixed list
- City or state
- Starting rate in naira, shown as "from ₦X". Optional, or "negotiable".
- Published / draft flag

**Profile photos: included at launch, with mandatory compression**

Every image goes through one Pitchype processing pipeline on the server. Client-side checks can be bypassed, so the server pass is authoritative.

- Accept JPEG, PNG, WebP, up to about 5 MB. Check real file type, not the extension.
- Strip EXIF metadata (phone photos often carry GPS location).
- Crop to square, resize to about 512x512, convert to WebP at roughly 80% quality. Target 30-80 KB.
- Keep only the processed version. Discard the original.
- Use `sharp` rather than a custom algorithm.
- Storage: public-read avatars bucket, server-only writes. Name files by user ID plus version to avoid stale caches.
- Vercel serverless functions cap request bodies at about 4.5 MB. Downscale in the browser with a canvas first. This also helps creators on slow mobile data.
- Moderation: a report button and an admin takedown to start.
- Defer portfolio galleries.

## 4. Niche list

Fixed list, stored as a database table (not hardcoded) so niches can be added without a deploy. Each creator picks up to three.

Food and drinks, Fashion, Beauty and skincare, Tech and gadgets, Lifestyle,
Travel, Fitness and wellness, Comedy and skits, Music and entertainment,
Education and career, Finance and business, Parenting and family, Faith and
inspiration, Gaming, Home and décor, Automotive, Sports.

No free-text "Other"; free-text niches break filtering.
