# Campaigns: Decisions

Status: decided 2026-11-09 while planning Stage 4. The Stage 4 build prompt is
not written yet; when it is, it should follow this file. A summary lives in
CLAUDE.md §12. Fees and money follow CLAUDE.md §6; where this file seems to
disagree, §6 wins.

## 1. Who can see campaigns

**Decision:** visible to signed-in creators, admins, and the owning business only.
- Briefs and prices are business information, and campaigns have no search value yet.
- A competitor can still sign up as a creator, so this reduces casual scraping rather than stopping it.
- Signed-out visitors can see that opportunities exist (for example a count of open campaigns on the landing page), so creators have a reason to sign up.
- A business cannot see other businesses' campaigns.

## 2. What a business can require

- Platforms
- Niches (from the fixed niche list)
- States (the 36 states plus FCT, as a fixed list) or "anywhere in Nigeria"
- Minimum follower range per platform. Matching rule: the creator's range lower bound meets the minimum.
- Optional "verified creators only" switch. Default off. Verification is manual at launch, so few creators will qualify. Show the business how many creators currently qualify before they publish.
- Engagement rate is dropped. It is not collected, and a self-reported figure cannot be trusted.

## 3. How deliverables are described

A short structured list plus free-text notes.
- Each item: platform, type (post, reel/video, story, etc.), quantity.
- Fixed set of types per platform. Block combinations that do not exist (for example stories on X).
- Optional posting window (earliest and latest date). It matters for proof and payout in later stages.
- Free-text notes for tone, mentions, hashtags.
- Stage 7 can then ask for proof per deliverable.

Deliverables describe what the creator posts. How they are paid is a separate choice (section 4). A pay-per-click campaign still has deliverables, such as "1 story with the link", and still needs proof of posting.

## 4. Price rules and payment models

**Payment models**
1. Fixed price (Stage 4 onward)
2. Pay per click (decided; built after Stage 6, see "Build order")
3. Fixed + per-click bonus (later)

Stage 4 stores `payment_model` on the campaign (default fixed) so pay per click
can be added without a migration of existing campaigns.

**Fixed price**
- One fixed price per creator in whole naira, minimum ₦5,000. Amounts are integers in kobo (CLAUDE.md §6 rule 1).
- Fees are exactly CLAUDE.md §6.1: the business pays the agreed price plus 5% on top (minimum ₦500); the creator's 5% (minimum ₦500) is deducted at release. At ₦5,000 the minimum fee is already 10% per side. The §6.1 invariant (the business fee always exceeds the Paystack charge) must hold at the ₦5,000 minimum; the fee test should cover it.
- The business sees the price plus fee, and a "maximum possible spend" (price x places + fees) when publishing.
- Creators can propose a different price when they apply (Stage 5). Because each accepted creator can then have a different price, nothing is escrowed at publish. Escrow happens per engagement when the business accepts the creator and funds it (CLAUDE.md §5 and §6), with the fee calculated on the agreed price.

**Pay per click**
- The business supplies a destination link, a cost per click (with a minimum), and a total click budget. Creators accept the terms by applying.
- The whole click budget is escrowed when the campaign goes live. Unspent budget is refunded when the campaign ends. Whether the fee on unspent budget is refunded follows §6.2 and is decided when this is built.
- Creators are paid in batches (weekly or at campaign end) with a minimum payout threshold. Per-click payouts are too small to send individually, and transfer fees would eat them.
- Both sides see a live dashboard: raw clicks, billable clicks, filtered clicks with reasons, money earned or spent.

**Tracked links**
- Do not embed the destination in the URL (for example `pitchype.com/campaign/123/konga.com/...`). That is one link per campaign, so clicks cannot be attributed to a creator, and it works as an open redirect that scammers can abuse.
- One short link per creator per campaign, such as `pitchype.com/r/k7Xq2`. The destination is stored on the server and cannot be changed through the URL.
- Generate the link when a creator is accepted, not when the campaign is published.
- Redirect with a 302 (not 301) so browsers do not cache it and skip the count.
- Append `utm_source=pitchype`, a campaign ID and a creator ID to the destination, so the business's own analytics give an independent second record. Let the business switch this off if their site breaks on extra parameters.

**Billable clicks**

Store every hit. Separately mark which are billable, and pay only for billable ones.
- Link previews: WhatsApp, Telegram, Facebook and X fetch links to build previews. Filter these, or one share counts as several clicks.
- Filter known bot user agents.
- Count repeat clicks from the same hashed IP and user agent once per 24 hours.
- Cap clicks per creator per day and rate-limit per IP.
- Hold payouts 48-72 hours to catch fraud before money moves.
- No CAPTCHA on the redirect. It hurts conversions.
- Store hashed IPs, not raw ones, to stay on the right side of Nigeria's data protection law.

**Destination safety**
- Accept https only. Reject IP addresses, localhost and non-web schemes.
- Require the destination to be on a domain the business has verified (a code in a DNS record or a page on their site, same idea as creator verification). At launch, first-campaign admin review is a reasonable stand-in.
- Block known URL shorteners and run a Google Safe Browsing check.

**Later:** pay per sale needs a postback or pixel from the business's checkout. Do not build it now.

**Tables (when pay per click is built)**
- `tracked_links`: campaign, creator, short code, status
- `link_clicks`: timestamp, hashed IP, hashed user agent, referrer, is_bot, is_billable, filter reason
- a daily rollup table so dashboards stay fast
- campaign fields: `cpc`, `click_budget`, `destination_url`

## 5. Review before publishing

**Decision:** campaigns go live without per-campaign review, with a safeguard for new businesses.
- Hold a business's first campaign for admin approval. After that, its campaigns publish immediately.
- Escrow protects creators' payment, but not against off-platform deals, dodgy products or loan apps. Add a lightweight check for phone numbers, WhatsApp links and similar contact details in briefs (also in `docs/TODO.md` for bios).
- Report button and admin takedown, same as profiles.
- Banned campaign types in the terms (gambling, adult content, get-rich-quick schemes). Whether to allow gambling and betting is the owner's call, since they are heavily advertised and regulated in Nigeria. Open in CLAUDE.md §12.

## 6. Editing after publishing

**Allowed:** changes to the wording, extending the deadline, adding places, closing early, pausing.
**Locked once live:** price (or cost per click), requirements, deliverables, and the destination link.
- Locking deliverables matters. Otherwise "2 reels" could become "10 reels" after creators applied.
- Wording can still change the meaning of a brief. Keep an edit history and notify existing applicants when the brief changes.
- Once a creator is accepted, snapshot the agreed terms for that creator. Later edits do not change what they agreed to.
- Do not allow reducing places below the number already accepted.

## 7. Images

**Decision:** no campaign images for now (logged in `docs/TODO.md`).
- A single product photo can reuse the profile photo pipeline later.
- A business logo is a cheaper first image to add, using the same pipeline.

## Build order

Follows the roadmap in `docs/BUILD_PROMPT.md`.

1. Stage 4: campaign schema with the CLAUDE.md §5 states, requirements and structured deliverables; visibility rules and the creator-facing list; edit locks; first-campaign admin review, report button and takedown.
2. Stage 5: apply (with optional proposed price), approve.
3. Stage 6: per-engagement escrow, ledger, payouts.
4. After Stage 6 is solid: tracked links and click logging with filtering, then the pay-per-click budget, escrow and payout batching, then the click dashboards. Click money rides on the ledger and payout rules, so it cannot come before them.
