# Pay-per-click campaigns: design

Date: 2026-11-18. Goal date: live in test mode by 2026-11-30.
Builds on `docs/campaign-spec-decisions.md` §4 (the decided rules), CLAUDE.md §5–§6, and the Stage 6 and 7 money code.

## 1. Intent

Brands such as Konga already buy pay-per-click ads on Meta and Google and already have campaign landing pages (a December Christmas sale, say). Pitchype lets them buy the same thing from micro and nano creators: a set price per click, a hard budget, and a click count both sides can trust. The business sees which creator sent which clicks. Its own analytics see sales through UTM tags, so Pitchype does not need to track sales.

Success: a business can publish a per-click campaign, approve and fund creators, and watch the clicks come in. After the campaign each creator is paid exactly for the billable clicks they sent, up to their cap, and the business gets the rest back. Both sides can explain every naira.

## 2. Goals, non-goals, anti-goals

**Goals**
- One short tracked link per approved creator per campaign, such as `pitchype.com/r/k7Xq2`.
- Every hit is stored; only filtered, unique clicks are billable; each filtered hit shows why it was filtered.
- Money follows the existing engagement escrow: each creator's share is funded, held and settled through the ledger.
- Both sides see live counts and money; there is an end-of-campaign summary.

**Non-goals (for this build)**
- Pay per sale, postbacks or pixels.
- Fixed price plus a click bonus.
- One payment for the whole budget, or a "pay for all approved" button (first follow-up after launch).
- Weekly payout batches (each hire settles once, after the campaign).
- Domain verification by DNS, and the Google Safe Browsing check (admin review stands in; see §6.4).
- A daily rollup table (add only when dashboard queries are measurably slow).

**Anti-goals: things that would count as failure even if the feature works**
- A click count either side can inflate by editing a URL.
- One WhatsApp share counted as several clicks.
- Pitchype losing money on a paid hire (the CLAUDE.md §6.1 invariant).
- A creator's earned money released before the fraud hold, or ever double-released.
- A broken link in a creator's old post. Links always redirect, even when they no longer count.
- The redirect becoming an open redirect.

## 3. Decisions (made with the owner, 2026-11-18)

| Decision | Choice |
|---|---|
| Overall rules | `docs/campaign-spec-decisions.md` §4, as written, except where this table differs |
| Build order | 1) tracked links and click counting, 2) click money, 3) dashboards and summary |
| Budget split | **Equal share per place.** Each approved creator can earn up to the budget per place; that share is the hire's escrow |
| When the business pays | **Per hire, at approval**, through the existing pay page (48h window, wallet first) |
| Minimum cost per click | **₦50**, whole naira |
| Minimum budget per place | ₦5,000 (same as the fixed-price minimum) |
| Fraud hold | 72 hours after the click window closes, then each hire settles once |
| Daily click cap per creator | None. The per-place budget caps exposure |
| Business fee on unspent budget | **Charged only on what was spent.** The fee kept is the largest of: 5% of the amount released, the ₦500 minimum, or Paystack's actual charge on the payment that funded the hire. It is never more than the fee paid |
| Clicks after a hire ends | Still redirect; not billable |

**Why the fee floor includes Paystack's charge.** Paystack keeps its charge on the full payment even when we refund. On a ₦100,000 place with no clicks, keeping only ₦500 would lose about ₦1,300. With the floor, a paid hire never loses money.

**Why ₦50.** Pitchype's fees are a percentage of money spent, so the price per click does not change revenue on a fully spent budget. What it changes is whether the budget gets spent: at ₦50, a ₦5,000 place needs 100 clicks; at ₦20 it needs 250, which most nano creators won't reach. ₦50 is at the low end of published Nigerian Meta CPCs (about ₦30–₦300) and below Google e-commerce search (about ₦80). The cost: each fake click is worth 2.5 times as much, so the filters and the hold carry more weight.

## 4. Approaches considered

**Budget split**
- *Equal share per place (chosen).* Each hire holds its own escrow, so everything that exists (funding, lapse, cancel, settle, disputes, race tests) is reused. Creators know their ceiling. Cost: a capped creator stops earning while another creator's share sits unused.
- *Shared pool.* Uses Konga's budget most fully, but creators can't predict earnings and money can run out mid-post. Needs a campaign-level escrow account.
- *Pool with a per-creator maximum.* Hardest to explain and to build.

**When the business pays**
- *Per hire at approval (chosen).* No new money paths. Cost: 20 creators means 20 checkouts, and 20 Paystack charges, each still below the business fee.
- *Whole budget at go-live (the spec's original plan).* One checkout, but it needs new campaign escrow, allocation and an unfilled-place refund. Too much new money code for the date.

**Where clicks are counted**
- *A plain Next.js route handler that calls one database function (chosen).* Matches CLAUDE.md §2 and §2a, runs on any Node host, and puts the billable decision in the database next to the money.
- *Edge function plus a queue or buffer.* Faster at very high volume. Not needed at nano-creator volumes; revisit if real traffic says so.

## 5. How a per-click hire runs

1. **Publish.** The business chooses "Pay per click" and enters the destination URL, the cost per click, the budget per place, the number of places, whether to add UTM tags (on by default) and any **blocked channels** (§6.5). Platforms and deliverables are chosen as for fixed-price campaigns. The form shows the maximum spend: places × (budget + business fee). Every per-click campaign is held for admin review at launch (§6.4). Once live, the destination, cost per click, budget per place, UTM setting and blocked channels are locked (they join the existing edit locks).
2. **Apply.** Creators apply as today. *(Changed 2026-11-22: they can propose their own cost per click; the budget per place stays the business's. See `2026-11-22-per-click-creator-rates-design.md`.)* Originally they could not propose a price: the cost per click and the cap were the terms. The blocked channels are shown before they apply, next to the platforms and deliverables, and again beside their link.
3. **Approve and fund.** Approval creates an `awaiting_payment` engagement whose `agreed_price_kobo` is the budget per place. The business pays budget + 5% fee (minimum ₦500) on the existing pay page. That is the same 48-hour lapse, the same wallet-first rule and the same non-refundable-fee notice, except that the notice is reworded for per-click: "We keep 5% of what's spent, at least ₦500 or the card charge."
4. **Start.** The creator presses "Start" on the funded hire (`funded → in_progress`). Their tracked link is created and shown then, with a copy button. Clicks are counted only while the hire is `in_progress` and the click window is open.
5. **Count.** See §6.
6. **Click window.** From the start until the end of the campaign's `deliver_by` day, Lagos time. A creator who hits their cap keeps a working link that no longer counts. A creator who withdraws stops counting from that moment.
7. **Hold, then settle.** 72 hours after the window closes, a daily job settles each hire: the released amount is billable clicks × cost per click, capped at the escrow. The creator fee is deducted from it (existing rule), the business fee is reduced per §3, and the rest of the escrow plus the fee difference goes to the business wallet. One `hire_settled` ledger group, through the existing settlement code. Status becomes `accepted` (some released) or `refunded` (nothing released).
8. **Flag during the hold.** Either side can open a dispute during the hold, for example "these clicks look fake". This uses the existing disputes table and admin page. An open dispute stops the automatic settlement; the admin decides with the existing outcomes (release, refund or split by amount), seeing the click breakdown.

## 6. Part 1: tracked links and click counting

### 6.1 Data (new migration)

- `campaigns`: add `cpc_kobo bigint`, `destination_url text`, `utm_tags boolean not null default true`, `blocked_channels text[] not null default '{}'` (values from the fixed list in §6.5, checked by a constraint). `price_kobo` holds the budget per place for per-click campaigns, so approval and payment code that reads the price keeps working. Constraints: for `per_click`, `cpc_kobo >= 5000` and a multiple of 100; `price_kobo >= 500000` and a multiple of `cpc_kobo` (so the cap is a whole number of clicks); `destination_url` is required. For `fixed`, the three new columns are null. Lift the "only fixed-price campaigns can be published for now" refusal in `transition_campaign()`.
- `tracked_links`: `id`, `code` (unique, 7 random base62 characters, made by the database), `engagement_id` (unique), `campaign_id`, `creator_id`, `created_at`, and two counters, `billable_clicks` and `total_hits`, updated by `record_click()` so the cap check doesn't need to count.
- `link_clicks`: `id`, `link_id`, `created_at`, `visitor_hash` (HMAC of IP and user agent), `ua_hash`, `referrer_host` (host only), `source` (the channel the hit came from when it can be told: `whatsapp`, `telegram`, `facebook`, `instagram`, `tiktok`, `x`, `youtube`, `snapchat`, `other_site` or `unknown`; from the referrer host, or from the preview fetcher's user agent for preview hits), `is_billable`, and `filter_reason`, which is null when billable, otherwise one of `preview`, `bot`, `blocked_channel`, `repeat`, `rate_limited`, `window_closed`, `cap_reached` or `hire_ended`. Index on `(link_id, visitor_hash, created_at)` and `(link_id, created_at)`. Append-only, with the same trigger pattern as `ledger_entries`.
- RLS: a creator reads their own link and its clicks; a business reads the links and clicks of hires on its own campaigns; admins read all. Nobody writes directly; `record_click()` is `security definer`, granted to `service_role` only.

### 6.2 The redirect: `src/app/r/[code]/route.ts`

1. Look up the link by code through `lib/db/clicks.ts`. An unknown code returns a plain 404 page, never a redirect.
2. Build the destination from the stored URL, never from the request. If `utm_tags` is on, add `utm_source=pitchype`, `utm_medium=creator`, `utm_campaign=<campaign id>` and `utm_content=<link code>`, keeping any parameters already on the URL.
3. Classify the hit in app code (pure, unit-tested in `src/lib/click-filter.ts`): link-preview user agents (WhatsApp, facebookexternalhit, Facebot, TelegramBot, Twitterbot, Slackbot, LinkedInBot, Discordbot, SkypeUriPreview, Applebot and similar), known bots and crawlers, a missing user agent, `HEAD` requests, and prefetches (`Purpose: prefetch` or `Sec-Purpose: prefetch`).
4. Call `record_click(code, visitor_hash, ua_hash, referrer_host, source, client_class)`. The database function locks the link row and decides billability in this order: preview/bot, then blocked channel (the hit's `source` is in the campaign's `blocked_channels`), then hire state (`hire_ended`, `window_closed`; a link only exists from the start, so there is no "not started" case), then cap, then repeat (same `visitor_hash` on this link in the last 24 hours), then the per-IP rate limit (more than 20 hits a minute from one visitor across all links). It inserts the click and bumps the counters. Because the link row is locked, two clicks at the cap can't both count.
5. Reply with a **302** to the destination and `Cache-Control: no-store`. **If recording fails, still redirect** and log one `console.error` line with the code (no IP). A lost click is better than a broken post, and the business's own UTM data is the second record.

Hashing: `visitor_hash = HMAC-SHA256(CLICK_HASH_SECRET, ip + "|" + user_agent)`. A secret key, because the IPv4 space is small enough to reverse a plain hash. Raw IPs are never stored (NDPR). `CLICK_HASH_SECRET` goes in `.env.example`. The proxy matcher in `src/proxy.ts` must not include `/r/`, so no session work runs on the redirect.

### 6.3 What people see in Part 1

- **Creator, on the hire page:** the link with a copy button once started; billable clicks, filtered hits, earned so far (billable × cost per click, capped) and "up to ₦X". Before starting: "Your link appears when you start."
- **Business, on the campaign's hires:** per creator, billable clicks and money spent so far; the campaign total.
- Counts update on page load. Live push isn't needed.

### 6.4 Destination safety

- `https` only; no IP-address hosts, `localhost`, ports, credentials in the URL or non-web schemes; at most 2,000 characters. The check is in `src/lib/campaign.ts`, and the database constraint repeats the `https://` prefix.
- Refuse known URL shorteners (bit.ly, tinyurl.com, t.co, goo.gl, is.gd, cutt.ly, rebrand.ly, ow.ly, buff.ly, shorturl.at and similar). A short list in code is enough.
- **Every per-click campaign goes to admin review at launch**, not only a business's first, so an admin can check that the destination belongs to the business. That stops anyone running a "Konga" campaign that isn't Konga. Domain verification (a DNS TXT code) replaces this later; logged in `docs/TODO.md`.

### 6.5 Blocked channels

The business picks channels where the link must not be shared, as a set of checkboxes: WhatsApp, Telegram, Facebook, Instagram, TikTok, X, YouTube, Snapchat. Two rules apply to every per-click campaign without a checkbox, and are shown to creators as such: **no paid ads promoting the link**, and **no click-for-reward or click-exchange groups**.

What we can and can't enforce, said plainly in the UI so nobody is misled:
- **Billing.** A click whose referrer or source shows a blocked channel is not billable (`blocked_channel`). Telegram's web client, Facebook, Instagram, X and YouTube usually send a referrer, so most of those are caught.
- **Evidence.** WhatsApp and the Telegram apps usually send no referrer, so their clicks look like `unknown`. But they fetch a preview when the link is shared, and that preview hit records `source = whatsapp` or `telegram`. A blocked channel's preview hits on a creator's link are shown to the business and the admin as a warning, "shared on WhatsApp, which this campaign blocks", and are evidence for a dispute during the hold. We don't stop counting a creator's other clicks automatically: one preview proves a share, not which clicks came from it.
- The always-on rules (paid ads, click-for-reward groups) can't be detected from a click. They're terms the creator agrees to by applying, enforced through disputes. The admin sees clicks per hour and per source, which makes a click farm's burst easy to spot.

## 7. Part 2: click money

> Built 2026-11-20 (plan `docs/superpowers/plans/2026-11-19-pay-per-click-part-2.md`). Differences: the cancel form states the per-click rule rather than an exact refund figure, since the page doesn't load the card charge; `settle_click_hire()` returns whether it settled and skips (not refuses) a hire that a dispute took out of `in_progress` mid-run.

- **Funding:** unchanged code. The engagement's `agreed_price_kobo` is the budget per place; `business_fee_kobo` is 5% of it, minimum ₦500, snapshotted as today.
- **Settlement:** a new function `settle_click_hire(engagement, actor, reason)`, internal only, with no grant to any role, like `settle_engagement_internal`. It is called by the cron (service role, through a `security definer` wrapper) and by `decide_dispute()` for per-click hires.
  - released = `least(billable_clicks × cpc_kobo, agreed_price_kobo)`, read under the link and engagement locks.
  - Creator fee: the existing rule (5%, minimum ₦500, never more than the released part).
  - Business fee kept = `least(business_fee_kobo, greatest(5% of released, min_fee_kobo, paystack charge of the funding payment))`; fee back = paid − kept. It is posted in the same `hire_settled` group as the escrow release, as `settle_money()` already does for the fault refund. The cleanest route is to give `settle_money()` a "per click" branch for the fee back, so there is still one function that empties escrow.
  - Settling a settled hire writes nothing.
- **Cron:** `/api/cron/settle-clicks`, daily, bearer `CRON_SECRET`. It settles every `in_progress` per-click hire whose click window plus 72 hours has passed and that has no open dispute, one subtransaction per hire (like `release_overdue_submissions()`). It is safe to run twice or late.
- **Hires that never start:** the business can cancel a funded, not-started per-click hire with the existing cancel. The fee kept follows the same per-click rule with released = 0 (so ₦500 or the card charge). A funded hire still `funded` when the window closes settles the same way at the hold. It is reported as "never started", and it is not the creator's fault refund, because the creator wasn't paid for anything.
- **Creator withdrawal** from `in_progress` stops clicks counting from then on. The hire settles normally at the hold for the clicks it earned. It is not a fault refund, because clicks already sent were delivered.
- **Proof of posting is for the record, not for review** (decided with the owner). The creator adds post links and screenshots with the existing proof form (same limits and private bucket) any time while the hire is `in_progress`, and can add more later. The business sees them on the hire; there is no accept, deny, review clock or auto-release, and they don't move money. A creator with no proof by the time the click window closes is flagged on both sides' screens. If the business objects to a post (wrong channel, off-brand, no proof), it opens a dispute during the hold and an admin decides. How this is stored: proof rows for per-click hires get a status of their own (`recorded`) or a separate table, whichever keeps Stage 7's submission state rules untouched; the builder picks.
- **Notifications:** reuse `engagement_settled` (it already carries the creator's net and fee). Add `click_cap_reached` (to the creator) and `click_settle_soon` (to both, when the hold starts, saying when it settles and how to flag a problem). Both emails are always sent (money).
- **Pay page and checkout notice:** show "up to N clicks at ₦X" and the per-click fee wording; store that the notice was seen (existing column).

## 8. Part 3: dashboards and summary

> Built 2026-11-21 (plan `docs/superpowers/plans/2026-11-20-pay-per-click-part-3.md`). Differences: the chart and sources stack under the counts (the cards are too narrow side by side); the summary counts only paid hires; in the CSV a settled hire shows "Running" until every hire on the campaign has settled. Added by the owner on 2026-11-20: once clicks have stopped, the business can't move the end date.

- **Business campaign page, "Clicks" tab:** a total (billable clicks, filtered hits, spent, remaining budget across funded places); a per-creator table (billable, filtered, filter reasons, spent, % of cap, proof added or not, a warning for any blocked-channel shares); clicks per day (simple bar chart, CSS or SVG, no new library); clicks by source.
- **Creator hire page:** the same for their own link, plus earned, our fee and what they'll receive.
- **End-of-campaign summary**, on both sides once every hire is settled: total clicks, spent, refunded, fees, and per-creator results. CSV export for the business (reuse the ledger CSV approach).
- **Admin:** the per-hire money trail gains the click breakdown; the dispute page shows it for per-click hires.

## 9. Rules that become tests

- pgTAP (`supabase/tests/clicks.test.sql`, `click_settlement.test.sql`): constraints on per-click campaigns, including `blocked_channels` values and their edit lock; `record_click()` billable order and every filter reason, including a blocked channel's click and a blocked channel's preview; the 24-hour repeat; the cap (the click after the cap is `cap_reached`); counters equal the click rows; clicks are append-only; RLS for creator, other creator, business, other business and anon; no role can call the internal settle function; settlement amounts at zero, partial, exact cap and over the cap; fee kept equals the largest of the three floors, never more than the fee paid; settling twice writes nothing; an open dispute blocks the cron.
- Unit (`src/lib/*.test.ts`): `click-filter.ts` (user agents, HEAD, prefetch, source from referrer host and from preview user agent); destination URL checks; UTM building that keeps existing parameters; per-click fee maths in `fees.ts`, including a test that the fee kept always covers Paystack's charge for every allowed budget.
- Race (`scripts/money-race.mjs`, new scenarios): two clicks at the cap from separate sessions (only one counts); the settle cron against opening a dispute; the settle cron run twice at once; creator withdraw against the settle cron.
- Run the full redirect flow against local Supabase: start a hire, click from two browsers and a WhatsApp-preview user agent, check the counts, move the clock, settle, check the wallet.

## 10. Docs to update in the same changes

CLAUDE.md §5 (per-click hire lifecycle), §6 (the per-click fee rule), §12 (item 11 decided: ₦50, ₦5,000, 72h, fee on spent); `docs/campaign-spec-decisions.md` §4 (mark the decisions made here); `.env.example` (`CLICK_HASH_SECRET`); `vercel.json` (new cron); `docs/TODO.md` (pay-all button, domain verification, Safe Browsing, rollup, weekly batches).

## 11. Left to the builder, and calls I made

**Calls confirmed by the owner (2026-11-18):**
- The link appears when the creator presses Start, not at funding, so the existing "work started" moment also starts the clicks.
- The click window ends at the end of `deliver_by`, Lagos time. No new date field.
- Every per-click campaign is admin-reviewed at launch.
- If recording fails, the redirect still happens.
- No proposed price on per-click applications.
- The budget per place must be a whole number of clicks.
- A limit of 20 hits a minute per visitor (IP and browser together, as confirmed by the owner), above which hits are not billable (still redirected). Not per IP alone: on Nigerian mobile networks thousands of people share one IP, so a per-IP limit would refuse real clicks on a popular post. The cost: a script that rotates browser names from one IP gets past it; the filters, the cap and disputes during the hold are the backstop.
- Counts refresh on page load; no Realtime.
- A creator withdrawal is paid for the clicks already sent.
- Blocked channels are a fixed checkbox list. Paid ads and click-for-reward groups are banned on every per-click campaign. A blocked channel's preview is a warning and dispute evidence; it doesn't cancel other clicks automatically.
- Blocked channels are for per-click campaigns only; fixed-price campaigns don't get them in this build.

**For the builder:** exact user-agent lists; the code alphabet and length (7 characters of base62 is plenty); how the `settle_money()` branch is shaped; page layout within the design system.

## 12. Answered with the owner after the builder check

- **Does the business review the post?** No. Proof is for the record; objections go to a dispute during the hold (§7).
- **Blocked channels:** added at the owner's request (§6.5), locked once live.
