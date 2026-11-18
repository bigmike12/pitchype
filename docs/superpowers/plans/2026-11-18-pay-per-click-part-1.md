# Pay per click, Part 1: tracked links and click counting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Businesses can create per-click campaigns; each started per-click hire gets a short tracked link; every hit is recorded and classified as billable or filtered; both sides see the counts. No click money moves in this part.

**Architecture:** Per-click terms live on `campaigns` (new columns, constraints, edit locks). `start_engagement()` creates a `tracked_links` row for per-click hires. A plain route handler at `/r/[code]` classifies the hit in pure TS (`src/lib/clicks.ts`), calls `record_click()` (one `security definer` database function that locks the link and decides billability), then 302-redirects to the stored destination. Read-only summary functions feed the creator's job page and the business's hire and campaign pages.

**Tech Stack:** Next.js 16 App Router route handler, Supabase Postgres (plpgsql, RLS, pgTAP), `node:crypto` HMAC, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-pay-per-click-design.md` (§3, §5, §6; Part 2 and 3 have their own plans).

## Global Constraints

- Branch `pay-per-click` from `main` (not from `audience-pages`). Commit the spec and this plan as the first commit.
- Schema changes only in new files in `supabase/migrations/` (timestamps from `20261119100000`). Never edit an applied migration. After each migration: `supabase migration up` locally (memory: don't `db reset` the dev database unless told), then `npm run db:types`.
- Minimum cost per click ₦50 (`5000` kobo), whole naira. Budget per place minimum ₦5,000 (`500000` kobo), whole naira, and a multiple of the cost per click. Places 1–500 as today.
- Destination: `https://` only; no IP-address host, no `localhost`, no port, no username/password, max 2,000 characters; known URL shorteners refused.
- Blocked channel values, exactly: `whatsapp`, `telegram`, `facebook`, `instagram`, `tiktok`, `x`, `youtube`, `snapchat`.
- Filter reasons, exactly: `preview`, `bot`, `blocked_channel`, `hire_ended`, `window_closed`, `cap_reached`, `repeat`, `rate_limited` (null = billable). Checked in that order.
- Click sources, exactly: the eight channel values plus `other_site` and `unknown`.
- Repeat window 24 hours, on the same link and the same `visitor_hash`, against earlier **billable** clicks. Rate limit: more than 20 hits in 60 seconds from one `visitor_hash` across all links → `rate_limited`.
- Click window ends at the end of the campaign's `deliver_by` day, Lagos time: `((deliver_by + 1)::timestamp at time zone 'Africa/Lagos')`.
- Raw IPs are never stored or logged. `visitor_hash = HMAC-SHA256(CLICK_HASH_SECRET, ip + "|" + userAgent)`, hex; `ua_hash = HMAC-SHA256(CLICK_HASH_SECRET, userAgent)`.
- Redirect is a 302 with `Cache-Control: no-store`; if anything in recording fails, still redirect and log one `console.error` line containing the code only.
- Every per-click campaign goes to `pending_review` on submit, trusted business or not. Creators can't propose a price on a per-click campaign.
- Not in this part: settlement, fee wording, proof-for-the-record, cron. Until Part 2 lands, per-click hires must not be approved on the hosted project; don't push these migrations to hosted Supabase before Part 2 is merged.
- CLAUDE.md applies: data access only in `src/lib/db/*`; authenticate → authorize → validate → act; tokens only from `globals.css`; new pages get a skeleton fallback; check at 390px.

## Review Focus

1. **A destination that already has a query string or a `#fragment`** — UTM tags are added to the query, existing parameters kept, the fragment stays last. Test in Task 2.
2. **Unknown, malformed or wrong-case codes** (`/r/K7XQ2`, `/r/../x`, `/r/` + 200 chars) — a plain 404, never a redirect, never a database error. Test in Task 5.
3. **`CLICK_HASH_SECRET` unset or the database unreachable** — the visitor still lands on the destination. Test in Task 5.
4. **A click at 23:59 vs 00:00 Lagos on the day after `deliver_by`** — billable, then `window_closed`. Test in Task 4.
5. **Two clicks at the cap at the same moment from separate sessions** — exactly one counts. Race scenario in Task 6.

---

### Task 1: Per-click campaign terms in the database

**Files:**
- Create: `supabase/migrations/20261119100000_per_click_campaigns.sql`
- Create: `supabase/tests/per_click_campaigns.test.sql`
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces: columns `campaigns.cpc_kobo bigint null`, `campaigns.destination_url text null`, `campaigns.utm_tags boolean not null default true`, `campaigns.blocked_channels text[] not null default '{}'`. `save_campaign_draft(...)` gains, after `deliverables`: `payment_model public.payment_model`, `cpc_kobo bigint`, `destination_url text`, `utm_tags boolean`, `blocked_channels text[]` (drop the old signature, create the new; keep grants as they were). `campaign_card()` and `get_campaign()` JSON gain `paymentModel`, `cpcKobo`, `destinationUrl` (owner and admins only; creators get the host only as `destinationHost`), `utmTags`, `blockedChannels`. Refusal code `price_fixed_per_click` (errcode `P0001`) from `apply_to_campaign` and `edit_application`.

- [ ] **Step 1: Write the failing pgTAP test** `per_click_campaigns.test.sql`, with the same setup style as `funding.test.sql`. Assertions:
  - `throws_ok` inserting a `per_click` campaign with `cpc_kobo = 4900` (below ₦50), with `cpc_kobo = 5050` (not whole naira), with `price_kobo = 499900`, with `price_kobo = 520000, cpc_kobo = 7000` (not a multiple), with `destination_url = 'http://konga.com'`, with `destination_url` null, with `blocked_channels = '{signal}'`.
  - `lives_ok` for `per_click`, `cpc_kobo 5000`, `price_kobo 2500000`, `destination_url 'https://www.konga.com/xmas'`, `blocked_channels '{whatsapp,telegram}'`.
  - `throws_ok` for a `fixed` campaign with non-null `cpc_kobo` or `destination_url`.
  - A trusted business (has an `approved_at` campaign) submitting a per-click draft → `status = 'pending_review'`; the same business submitting a fixed draft → `open`.
  - On an `open` per-click campaign, updating each of `cpc_kobo`, `destination_url`, `utm_tags`, `blocked_channels` throws `42501`; extending `deliver_by` lives.
  - As a creator, `apply_to_campaign(per_click_id, 600000, null)` throws `price_fixed_per_click`; with null price it lives; `edit_application` with a price throws the same.
  - `get_campaign()` as a creator returns `destinationHost = 'www.konga.com'` and no `destinationUrl`; as the owner it returns `destinationUrl`.
- [ ] **Step 2: Run it and see it fail.** Run: `supabase test db` — Expected: FAIL (column `cpc_kobo` does not exist).
- [ ] **Step 3: Write the migration.** Columns and check constraints as in Global Constraints (URL check in SQL: `destination_url ~ '^https://' and char_length(destination_url) <= 2000`; the full URL rules are in Task 2's TS). `blocked_channels <@ array['whatsapp','telegram','facebook','instagram','tiktok','x','youtube','snapchat']` and distinct. `create or replace` `campaigns_before_write()` from its latest version (`20261110100100_create_applications.sql`), adding the four columns to the locked tuple. `create or replace` `transition_campaign()` from `20261109162551`: remove the "only fixed-price campaigns" refusal; on submit, `per_click` always goes to `pending_review`. `create or replace` `apply_to_campaign` (latest: `20261114100000`) and `edit_application` (`20261110100100`) to refuse a non-null price on per-click campaigns. Update `campaign_card` (latest: `20261117101000`) and `get_campaign` for the JSON fields. Comment the invariants at the top of the file.
- [ ] **Step 4: Run it and see it pass.** Run: `supabase migration up && supabase test db` — Expected: all files PASS, including the existing ones.
- [ ] **Step 5: Regenerate types and typecheck.** Run: `npm run db:types && npm run typecheck` — Expected: the only errors are callers of `save_campaign_draft` (fixed in Task 3). Note them, don't fix here.
- [ ] **Step 6: Commit.** `git commit -m "Add per-click campaign terms with locks and review"`

### Task 2: Pure per-click rules in TypeScript

**Files:**
- Modify: `src/lib/campaign.ts`, `src/lib/campaign.test.ts`
- Create: `src/lib/clicks.ts`, `src/lib/clicks.test.ts`

**Interfaces:**
- Produces (in `campaign.ts`):
  - `type PaymentModel = "fixed" | "per_click"`, `type Channel = "whatsapp" | "telegram" | "facebook" | "instagram" | "tiktok" | "x" | "youtube" | "snapchat"`, `const CHANNELS: readonly Channel[]`, `const CHANNEL_LABELS: Record<Channel, string>`.
  - `MIN_CPC_NAIRA = 50`.
  - `CampaignInput` gains `paymentModel: PaymentModel; cpcKobo: number | null; destinationUrl: string | null; utmTags: boolean; blockedChannels: Channel[]`. `CampaignField` gains `"cpc" | "destinationUrl" | "blockedChannels"`.
  - `checkDestinationUrl(raw: string): { url: string } | { error: string }`.
  - `maxClicks(budgetKobo: number, cpcKobo: number): number`.
  - `parseCampaignForm` reads `payment_model`, `cpc`, `destination_url`, `utm_tags`, `blocked_channels` (multi-value) form fields.
- Produces (in `clicks.ts`):
  - `type ClickSource = Channel | "other_site" | "unknown"`, `type ClientClass = "human" | "preview" | "bot"`.
  - `classifyClient(method: string, userAgent: string | null, headers: { purpose: string | null; secPurpose: string | null }): ClientClass`.
  - `clickSource(referrer: string | null, userAgent: string | null): ClickSource`.
  - `referrerHost(referrer: string | null): string | null`.
  - `destinationWithTags(destination: string, opts: { utmTags: boolean; campaignId: string; code: string }): string`.
  - `hashVisitor(secret: string, ip: string, userAgent: string): string` and `hashUserAgent(secret: string, userAgent: string): string`.
  - `const LINK_CODE = /^[0-9A-Za-z]{7}$/`.

- [ ] **Step 1: Write failing tests** in `campaign.test.ts`:
  - `checkDestinationUrl`: accepts `https://www.konga.com/xmas?ref=a`; refuses `http://konga.com`, `https://127.0.0.1/x`, `https://localhost/x`, `https://konga.com:8443/`, `https://u:p@konga.com/`, `javascript:alert(1)`, `https://bit.ly/abc`, `https://tinyurl.com/x`, `https://t.co/x`, and a 2,001-character URL. Each refusal has a non-empty `error`.
  - `maxClicks(2500000, 5000) === 500`.
  - `parseCampaignForm` with `payment_model=per_click`, `cpc=50`, `price=25000`, valid URL, `blocked_channels=whatsapp` + `blocked_channels=telegram` → ok with `cpcKobo 5000`, `priceKobo 2500000`, `blockedChannels ["whatsapp","telegram"]`, `utmTags false` when the checkbox is absent, `true` when `utm_tags=on`. Errors: `cpc=49` → `errors.cpc`; `cpc=50.5` → `errors.cpc`; `price=25020, cpc=50` → `errors.price` ("a whole number of clicks"); `blocked_channels=signal` → `errors.blockedChannels`. With `payment_model=fixed`, the per-click fields come back null/empty even if posted.
- [ ] **Step 2: Write failing tests** in `clicks.test.ts`:
  - `classifyClient`: `HEAD` → `preview`; UA null → `bot`; `WhatsApp/2.23.20.0` → `preview`; `TelegramBot (like TwitterBot)` → `preview`; `facebookexternalhit/1.1` → `preview`; `Twitterbot/1.0` → `preview`; `Googlebot/2.1` → `bot`; `curl/8.4.0` → `bot`; `purpose: prefetch` or `sec-purpose: prefetch;prerender` → `preview`; a normal iPhone Safari UA → `human`.
  - `clickSource`: referrer `https://l.facebook.com/` → `facebook`; `https://l.instagram.com/` → `instagram`; `https://t.co/x` → `x`; `https://web.telegram.org/` → `telegram`; `https://web.whatsapp.com/` → `whatsapp`; `https://www.tiktok.com/` → `tiktok`; `https://m.youtube.com/` → `youtube`; `https://blog.example.com/` → `other_site`; no referrer + UA containing `Instagram 300.0` → `instagram`; no referrer + `FBAN/FBIOS` → `facebook`; no referrer + `BytedanceWebview` → `tiktok`; no referrer + `Snapchat/12` → `snapchat`; no referrer + `WhatsApp/2` → `whatsapp`; no referrer + `TelegramBot` → `telegram`; no referrer + Safari → `unknown`; referrer `not a url` → `unknown`.
  - `destinationWithTags("https://konga.com/xmas?ref=a#top", { utmTags: true, campaignId: "c1", code: "k7Xq2ab" })` → `https://konga.com/xmas?ref=a&utm_source=pitchype&utm_medium=creator&utm_campaign=c1&utm_content=k7Xq2ab#top`; with `utmTags: false` → the input unchanged; an existing `utm_source=x` is replaced, not duplicated.
  - `hashVisitor("s", "1.2.3.4", "ua")` is 64 hex characters, stable, and differs from `hashVisitor("s2", ...)`.
  - `LINK_CODE` accepts `k7Xq2ab`, refuses `k7Xq2a`, `k7Xq2ab1`, `k7Xq-ab`.
- [ ] **Step 3: Run and see them fail.** Run: `npm test` — Expected: FAIL (exports missing).
- [ ] **Step 4: Implement** in `campaign.ts` and `clicks.ts`. Use the WHATWG `URL` parser for URLs and the hostname IP check (IPv4 dotted quad or a bracketed IPv6). Shortener list in `campaign.ts` (one `Set`): `bit.ly, tinyurl.com, t.co, goo.gl, is.gd, cutt.ly, rebrand.ly, ow.ly, buff.ly, shorturl.at, rb.gy, tiny.cc, s.id, t.ly`. Preview UA patterns: `WhatsApp`, `TelegramBot`, `facebookexternalhit`, `Facebot`, `Twitterbot`, `Slackbot`, `LinkedInBot`, `Discordbot`, `SkypeUriPreview`, `Applebot`, `Pinterestbot`, `redditbot`, `Embedly`. Bot pattern: `/bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|headless/i`, checked after the preview patterns.
- [ ] **Step 5: Run and see them pass.** Run: `npm test` — Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "Add per-click campaign rules and click classification"`

### Task 3: Creating and showing per-click campaigns

**Files:**
- Modify: `src/lib/db/campaigns.ts` (`saveCampaignDraft`, `getOwnCampaign`, `toListing`, `CampaignDetail`)
- Modify: `src/app/(portal)/(business)/business/campaigns/campaign-form.tsx`, `.../campaigns/actions.ts`, `.../campaigns/[id]/page.tsx`
- Modify: `src/app/(portal)/(influencer)/campaigns/[id]/page.tsx`, `.../campaigns/[id]/apply-form.tsx`, `.../campaigns/[id]/application-panel.tsx`
- Modify: `src/lib/applications.ts`, `src/lib/applications.test.ts` (per-click parse refuses a price)
- Modify: `src/app/(portal)/(business)/business/campaigns/[id]/applications/page.tsx` (no "asks ₦…" for per-click)

**Interfaces:**
- Consumes: Task 1's columns and RPC signature; Task 2's `CampaignInput`, `CHANNELS`, `CHANNEL_LABELS`, `maxClicks`, `checkDestinationUrl`.
- Produces: `CampaignDetail` gains `paymentModel`, `cpcKobo`, `destinationHost`, `destinationUrl: string | null`, `utmTags`, `blockedChannels`. `parseApplication(form, campaignPriceKobo, paymentModel)` in `applications.ts` (third parameter added; when `per_click`, any posted price is ignored and `proposedPriceKobo` is null).

- [ ] **Step 1: Write the failing unit test** in `applications.test.ts`: `parseApplication` with `price=9000`, campaign price `2500000`, `"per_click"` → ok, `proposedPriceKobo === null`.
- [ ] **Step 2: Run it and see it fail; implement; run it and see it pass.** Run: `npm test`.
- [ ] **Step 3: Campaign form.** A "How you pay" radio (`Fixed price` / `Pay per click`). For per-click, show: destination URL; cost per click (₦, min 50); "Budget per creator" (reuses the `price` field) with a live line, "Up to N clicks per creator"; UTM checkbox (checked by default) with the hint "Adds utm_source=pitchype so your own analytics see these visits"; blocked channels as checkboxes, plus the fixed line "Paid ads and click-for-reward groups are never allowed." The max-spend line uses the existing `maxSpend`. Native radios and checkboxes; tokens only; works at 390px; no JS beyond what the form already uses to toggle sections.
- [ ] **Step 4: Action and data access.** Pass the new fields through `saveCampaignDraft` to the new RPC signature. `npm run typecheck` is now clean.
- [ ] **Step 5: Campaign pages.** On the business campaign page and the creator campaign page, a per-click campaign shows "₦50 per click · up to 500 clicks (₦25,000)", the destination host, and the blocked channels with the two always-on rules. The creator apply form hides the price input for per-click and says "The price per click is fixed." The business applications list shows no price ask for per-click.
- [ ] **Step 6: Exercise it.** `npm run dev` (port 3030); as a local business, create and submit a per-click draft → it lands in "Waiting for review"; approve it as admin; as a creator, open it and apply. Check the form at 390px. Record what you saw in the commit body.
- [ ] **Step 7: Lint, typecheck, test.** Run: `npm run lint && npm run typecheck && npm test` — Expected: clean.
- [ ] **Step 8: Commit.** `git commit -m "Let businesses create pay-per-click campaigns"`

### Task 4: Tracked links and `record_click()`

**Files:**
- Create: `supabase/migrations/20261119100100_tracked_links.sql`
- Create: `supabase/tests/clicks.test.sql`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces:
  - `tracked_links(id uuid pk, code text unique not null, engagement_id uuid unique not null references engagements, campaign_id uuid not null, creator_id uuid not null, billable_clicks integer not null default 0, total_hits integer not null default 0, created_at timestamptz not null default now())`.
  - `link_clicks(id bigint generated always as identity pk, link_id uuid not null, created_at timestamptz not null default now(), visitor_hash text not null, ua_hash text, referrer_host text, source text not null, is_billable boolean not null, filter_reason text)`. Indexes `(link_id, visitor_hash, created_at)`, `(link_id, created_at)`, `(visitor_hash, created_at)`. Check constraints on `source` and `filter_reason` values, and `is_billable = (filter_reason is null)`.
  - `record_click(code text, visitor_hash text, ua_hash text, referrer_host text, source text, client_class text) returns jsonb` → `{ "destination": text, "utmTags": bool, "campaignId": uuid, "billable": bool, "reason": text|null }`, or null for an unknown code. `security definer`, `service_role` only.
  - `start_engagement()` (replace, from `20261113100200`): when the campaign is `per_click`, insert the `tracked_links` row in the same transaction.
  - `engagement_click_summary(engagement uuid) returns jsonb` (`security invoker`): `{ code, billable, totalHits, filtered: { <reason>: n }, sources: { <source>: n }, blockedShares: [<channel>…], cpcKobo, capKobo, earnedKobo }`, where `earnedKobo = least(billable × cpc, cap)` and `blockedShares` = the blocked channels with at least one `preview` hit from that source.
  - `campaign_click_summary(campaign uuid) returns jsonb` (`security invoker`): `{ totals: {billable, totalHits, spentKobo}, hires: [{ engagementId, creatorName, code, billable, totalHits, earnedKobo, capKobo, blockedShares }] }`.

- [ ] **Step 1: Write the failing pgTAP test** `clicks.test.sql`. One per-click campaign (cpc 5000, price 500000 → cap 100 clicks; `blocked_channels '{whatsapp}'`; `deliver_by` = Lagos today + 5), a funded engagement, plus a fixed-price funded engagement. Assertions:
  - `start_engagement` on the per-click hire creates exactly one `tracked_links` row with a 7-character `[0-9A-Za-z]` code; on the fixed hire, none.
  - As `service_role`: `record_click(code, 'v1', 'u1', null, 'unknown', 'human')` → `billable true`, `destination` correct. The same again → `reason 'repeat'`. `'v2'` with `client_class 'preview'` and `source 'whatsapp'` → `preview`. `'v3'` with `'bot'` → `bot`. `'v4'`, human, `source 'whatsapp'` → `blocked_channel`. Unknown code → null, nothing inserted.
  - Counters equal `count(*)` and `count(*) filter (where is_billable)` from `link_clicks`.
  - Repeat window: back-date v1's click to 24h + 1s ago → v1 is billable again.
  - Rate limit: 20 hits from `'v9'` in the last minute (across two links), then the 21st → `rate_limited`.
  - Cap: set `billable_clicks` to 99 via 99 distinct visitors (generate_series), the 100th is billable, the 101st is `cap_reached`.
  - Window: `deliver_by` = Lagos yesterday → `window_closed`. And with `deliver_by` today, set the clock with a `now`-independent check: call through a helper `click_window_open(deliver_by date, at timestamptz)` (also used inside `record_click`) at Lagos 23:59:59 on `deliver_by` → true, at 00:00:00 the next day → false.
  - Hire ended: set the engagement `accepted` → `hire_ended`.
  - `link_clicks` update/delete/truncate throw for every role (same trigger pattern as `ledger_entries`).
  - Grants: `authenticated` and `anon` cannot execute `record_click`; no role can insert into either table directly.
  - RLS: the creator sees their own link and clicks; another creator sees none; the business sees them; another business sees none; anon none. `engagement_click_summary` as the creator returns `billable`, `earnedKobo = billable × 5000`, `blockedShares ['whatsapp']`; as another business returns null.
- [ ] **Step 2: Run and see it fail.** Run: `supabase test db` — Expected: FAIL (`tracked_links` does not exist).
- [ ] **Step 3: Write the migration.** `record_click` locks the link (`for update`), then the engagement row is read (no lock needed: status only gates billability, and money doesn't move here). Decide the reason in the order in Global Constraints, insert the click, bump the counters, return. Code generation: 7 characters from `gen_random_bytes` mapped to base62, retry up to 5 times on a unique conflict. Comment the invariants (counters match rows; a click is billable only while the hire is `in_progress`, the window is open and the cap isn't reached; at most one billable click per visitor per link per 24h).
- [ ] **Step 4: Run and see it pass.** Run: `supabase migration up && supabase test db` — Expected: all PASS.
- [ ] **Step 5: Regenerate types.** Run: `npm run db:types && npm run typecheck` — Expected: clean.
- [ ] **Step 6: Commit.** `git commit -m "Record tracked-link clicks with billable filtering"`

### Task 5: The `/r/[code]` redirect

**Files:**
- Create: `src/lib/db/clicks.ts`
- Create: `src/app/r/[code]/route.ts`
- Create: `src/app/r/[code]/redirect.ts`, `src/app/r/[code]/redirect.test.ts`
- Modify: `.env.example` (`CLICK_HASH_SECRET=`), `docs/TODO.md` (set `CLICK_HASH_SECRET` on Vercel and hosted)
- Check: `src/proxy.ts` matcher does not cover `/r/`

**Interfaces:**
- Consumes: `record_click` (Task 4); `classifyClient`, `clickSource`, `referrerHost`, `destinationWithTags`, `hashVisitor`, `hashUserAgent`, `LINK_CODE` (Task 2).
- Produces:
  - `recordClick(input: { code: string; visitorHash: string; uaHash: string | null; referrerHost: string | null; source: ClickSource; clientClass: ClientClass }): Promise<{ destination: string; utmTags: boolean; campaignId: string } | null>` in `src/lib/db/clicks.ts`. It uses the admin client and throws on a database error.
  - `lookupDestination(code: string): Promise<{ destination: string; utmTags: boolean; campaignId: string } | null>` in `db/clicks.ts`: a plain read of the link's destination through the admin client, recording nothing.
  - `handleLinkHit(req: { code: string; method: string; ip: string; headers: Headers }, deps: { secret: string | undefined; record: typeof recordClick; lookup: typeof lookupDestination; log: (line: string) => void }): Promise<{ status: 302; location: string } | { status: 404 }>` in `redirect.ts`. It's pure apart from `deps`, so it can be unit-tested. If recording throws or the secret is missing, it falls back to `deps.lookup`. If that also fails, the response is a 404 page that says the link couldn't be opened and asks the visitor to try again.

- [ ] **Step 1: Write failing tests** in `redirect.test.ts` with fake `deps`:
  - Code `k7Xq2ab`, record returns `{ destination: "https://konga.com/x", utmTags: true, campaignId: "c1" }` → `302` to `https://konga.com/x?utm_source=pitchype&utm_medium=creator&utm_campaign=c1&utm_content=k7Xq2ab`.
  - Code `../x`, `abc` or 200 characters → `404`, and `record` is never called.
  - Record returns null → `404`.
  - Record throws → `lookup` is used, `302`, and `log` is called once with a line containing the code and not the IP.
  - `secret` undefined → `record` isn't called, `lookup` is used, `302`, one log line.
  - Record and lookup both throw → `404`.
  - `HEAD` with `WhatsApp/2` → `record` is called with `clientClass 'preview'` and `source 'whatsapp'`, and the response is still `302`.
  - `record` receives `visitorHash` equal to `hashVisitor(secret, ip, ua)`, never the raw IP.
- [ ] **Step 2: Run and see them fail.** Run: `npm test`.
- [ ] **Step 3: Implement** `handleLinkHit`, `recordClick`, `lookupDestination`, and the `GET` and `HEAD` handlers in `route.ts`. They read `x-forwarded-for` the same way `src/lib/client-ip.ts` does (from `request.headers`, since it's a route handler), set `export const dynamic = "force-dynamic"` and return `new Response(null, { status: 302, headers: { Location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } })`. The 404 is a small plain HTML response with no portal shell.
- [ ] **Step 4: Run and see them pass.** Run: `npm test` — Expected: PASS.
- [ ] **Step 5: Exercise it locally.** Start a per-click hire from Task 3's setup. `curl -sI localhost:3030/r/<code>` → `302` with the UTM'd `Location`. `curl -sI -A "WhatsApp/2.23" ...` → `302`. Check the `link_clicks` rows: the first is `bot` (curl's user agent), the second is `preview`/`whatsapp`. Open the link in a browser → billable. Open it again → `repeat`. Unset `CLICK_HASH_SECRET` and restart → still redirects, with one log line.
- [ ] **Step 6: Commit.** `git commit -m "Redirect tracked links and record each hit"`

### Task 6: Race scenario for the cap

**Files:**
- Modify: `scripts/money-race.mjs` (and `money-race-lib.mjs` if setup helpers are needed)

**Interfaces:**
- Consumes: `record_click`, `start_engagement` (Task 4).

- [ ] **Step 1: Add scenario 22**, "two clicks at the cap". Set up a per-click hire with a cap of 100 clicks and 99 billable clicks already recorded. From two separate Postgres sessions, call `record_click` at the same moment with different visitors. Assert: exactly one result is `billable`, the other is `cap_reached`, `billable_clicks = 100`, and the counters match the rows. Repeat 20 rounds, as the other scenarios do.
- [ ] **Step 2: Add scenario 23**, "a click against the hire ending". Call `record_click` in one session while another session moves the engagement out of `in_progress` (update it as the owner, the way the existing scenarios fake settlement). Assert: the click is either billable and recorded before the change, or `hire_ended`, and never billable after the status changed.
- [ ] **Step 3: Run it.** Run: `node scripts/money-race.mjs` — Expected: all scenarios pass, including 1–21.
- [ ] **Step 4: Commit.** `git commit -m "Race-test the click cap and hire end"`

### Task 7: Counts on the hire and campaign pages

**Files:**
- Modify: `src/lib/db/clicks.ts` (add reads)
- Modify: `src/app/(portal)/(influencer)/jobs/[id]/page.tsx` (+ its `loading.tsx` skeleton)
- Modify: `src/app/(portal)/(business)/business/engagements/[id]/page.tsx` (+ skeleton)
- Modify: `src/app/(portal)/(business)/business/campaigns/[id]/page.tsx` (+ skeleton)
- Create: `src/components/clicks/click-summary.tsx`, `src/components/clicks/copy-link.tsx` (client component, uses `navigator.clipboard`)
- Create: `src/lib/click-words.ts`, `src/lib/click-words.test.ts`

**Interfaces:**
- Consumes: `engagement_click_summary`, `campaign_click_summary` (Task 4); `formatNaira` from `lib/money.ts`.
- Produces: `getEngagementClicks(engagementId: string): Promise<EngagementClicks | null>` and `getCampaignClicks(campaignId: string): Promise<CampaignClicks | null>` in `db/clicks.ts` (session client, so RLS decides). In `click-words.ts`: `filterReasonText(reason: FilterReason): string` (e.g. `repeat` → "Same person within 24 hours", `preview` → "Link preview, not a person", `blocked_channel` → "From a channel this campaign blocks", `cap_reached` → "After the click limit", `window_closed` → "After the campaign ended", `hire_ended` → "After the job ended", `rate_limited` → "Too many hits at once", `bot` → "Automated visitor"), and `blockedShareWarning(channel: Channel): string` → "Shared on WhatsApp, which this campaign blocks".

- [ ] **Step 1: Write failing tests** in `click-words.test.ts`: every `FilterReason` has non-empty text; `blockedShareWarning("whatsapp")` is exactly the string above.
- [ ] **Step 2: Run them, see them fail, implement, run them and see them pass.** Run: `npm test`.
- [ ] **Step 3: Creator job page.** For a per-click hire that's `in_progress` or later: the full link `https://<site>/r/<code>` (from `src/lib/site.ts`) with a Copy button; "N clicks counted · ₦X earned so far · up to ₦cap"; a collapsible "Not counted" list (reason → count); any blocked-share warning. Before Start: "Your link appears when you start." This replaces the Stage 7 submit form for per-click hires; Part 2 adds proof-for-the-record.
- [ ] **Step 4: Business hire page.** The same counts as "spent so far", plus the warning.
- [ ] **Step 5: Business campaign page.** A "Clicks" section: totals, and per creator a row with billable clicks, spent, % of cap and a warning icon with text. Refreshed on page load only.
- [ ] **Step 6: Exercise it.** Using Task 5's local setup, view all three pages as each side, at 390px and on desktop. Check the skeletons by throttling. Note what you saw in the commit body.
- [ ] **Step 7: Lint, typecheck, test.** Run: `npm run lint && npm run typecheck && npm test && supabase test db` — Expected: clean.
- [ ] **Step 8: Commit.** `git commit -m "Show click counts to creators and businesses"`

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (§5 Campaign: per-click terms, the always-review rule and locks; §6.6: tracked links and `record_click` in a short paragraph; §12: item 11 partly decided, with ₦50, ₦5,000 and 72h, and the fee on spend left for Part 2's docs), `docs/campaign-spec-decisions.md` §4 (mark what's decided and where), `docs/TODO.md` (follow-ups: pay-all button, DNS domain verification, Safe Browsing, daily rollup, weekly batches, `CLICK_HASH_SECRET` on hosted).

- [ ] **Step 1: Write the updates.** Keep the CLAUDE.md additions to a few lines each, in its existing voice.
- [ ] **Step 2: Final check.** Run: `npm run lint && npm run typecheck && npm test && supabase test db && node scripts/money-race.mjs` — Expected: all pass.
- [ ] **Step 3: Commit.** `git commit -m "Document pay-per-click links and counting"`
