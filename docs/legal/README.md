# Legal review pack (draft for a lawyer)

Written 2026-11-17 from how the product is built and decided today. **Nothing
here has been reviewed by a lawyer, and none of it is live.** The live
`/terms` and `/privacy` pages still show the old waitlist-only drafts.

| File | What it is |
|---|---|
| [terms.md](terms.md) | Draft terms of use covering accounts, campaigns, escrow, fees, cancellations, disputes and conduct |
| [privacy.md](privacy.md) | Draft privacy notice covering the data we actually store, who processes it and why |
| This file | What the product does, what we need decided, and the questions for counsel |

Square brackets in the drafts, `[like this]`, mark something we haven't
decided or that counsel must confirm. Text in the drafts is plain English on
purpose; counsel should tighten it, not replace the plain style.

### Drafts of 2026-11-24 (in `drafts/`)

Written from the code on `main` (the Paystack build). They supersede the
2026-11-17 privacy draft once approved; `privacy.md` and
`aml-data-protection-policy.md` are kept until then.

| File | Audience | What it is |
|---|---|---|
| [drafts/1-public-privacy-notice.md](drafts/1-public-privacy-notice.md) | Public | Privacy notice for the website footer, matched to the fields the app stores |
| [drafts/2-internal-data-protection-policy.md](drafts/2-internal-data-protection-policy.md) | Team and counsel | Data map, processors, admin access, retention, gap register, 72-hour NDPC breach workflow |
| [drafts/3-internal-aml-cft-fraud-policy.md](drafts/3-internal-aml-cft-fraud-policy.md) | Team and counsel | AML/CFT and fraud policy on the escrow flow, auto-release, ledger and payout review, with the automated checks still to build |

The planned Cray (payments) and Dojah (identity) work sits on unmerged
branches. The drafts say where they would change things; update them when
those branches merge.

## Who we are

- **Pitchype**: a marketplace connecting businesses with micro and nano
  creators, Nigeria first. Operator entity, registration number and address:
  `[to be filled in; we don't have a registered entity named in the repo]`.
- Contact inbox: `hello@pitchype.com` (placeholder in the site until
  confirmed).
- One role per account: a business or a creator, fixed at sign-up. Admins are
  Pitchype staff.

## How money works (what the terms must describe accurately)

Source of truth for the rules: CLAUDE.md §6. Summary:

- Business pays the agreed price **plus a 5% fee on top** (minimum ₦500).
  Price goes into escrow. Escrow is a record in our database; the cash sits
  in Pitchype's Paystack balance.
- On release, the creator pays a **5% fee on the amount released** (minimum
  ₦500, never more than the amount). Example: ₦50,000 released, ₦2,500 fee,
  ₦47,500 to the creator's wallet.
- Creators request payouts from their wallet (minimum ₦1,000). The creator
  pays the bank-transfer cost (Paystack's fee plus ₦50 stamp duty from
  ₦10,000), shown before they confirm. Every payout is approved by an admin
  first.
- Refunds go to the **business wallet**, not back to the card. Wallet
  balance can only come from refunds and from payments that arrive after the
  hire was cancelled or lapsed. There are no top-ups. Withdrawal of wallet
  balance to a bank is **not built**; an admin refunds by hand on request.
- Cancellation table (what the business gets back, what we keep) is in
  CLAUDE.md §6.2 and reproduced in the terms.
- A hire must be paid for within 48 hours of approval or it lapses.
- Auto-release: if the business doesn't respond to submitted work for 7
  days, escrow is released to the creator. **Submissions, review and disputes
  (Stage 7) are not built yet**; the terms describe the decided design and
  say so where it matters.
- Suspension never takes money: a suspended account is still owed its
  running work, escrow and payouts.

## Decisions we still owe counsel (do not let the lawyer guess)

1. **Banned campaign categories**, including whether gambling and betting are
   allowed (CLAUDE.md §12 item 10). The terms have a placeholder list.
2. **Dispute process**: who decides, how long it takes, how "creator at
   fault" is judged, and how many times a creator may resubmit after a denial
   (§12 item 3). Stage 7 will set these; the terms say only what is decided.
3. **Business wallet withdrawal to bank** (§12 item 9).
4. **Operating entity, governing law, venue, notice address.**
5. **Minimum age** for accounts `[18?]`.

## Questions for a Nigerian fintech and data-protection lawyer

Regulatory (the CLAUDE.md §6 compliance flag):

1. Does holding businesses' payments until work is approved, then paying
   creators from a wallet, need a licence or registration in Nigeria (for
   example a CBN payment service licence), or can it run as an agent or
   merchant on Paystack's rails? If it needs a licence, what are the
   alternatives (a licensed partner, a trust or escrow account at a bank)?
2. Does Paystack's own agreement allow this use (holding funds for others
   and paying out third parties)? Who should ask Paystack, and what do we
   need in writing?
3. How should creator and business **wallet balances** be held and described
   (they are our ledger entries; there is no separate account per person)?
4. Is the **auto-release after 7 days** enforceable and fairly disclosed as
   written?
5. Is the **non-refundable business fee** (kept when a business cancels after
   paying) acceptable, and is the disclosure enough? (We make the business
   tick a notice at checkout and store the time.)
6. Tax: VAT on our fees, withholding tax on creator earnings, whether we have
   reporting duties, and what the invoices or receipts must say.
7. Consumer-protection and advertising rules: disclosing paid promotions
   (creators posting sponsored content), and our liability for what creators
   post.
8. Restricted or regulated campaign types (gambling, loans, alcohol,
   health claims) and our duty to block or review them.
9. Chargebacks: card chargebacks raised through a business's bank (₦2,500
   each from Paystack) are the one way a payment can lose money. How do the
   terms allocate that?

Data protection (the Nigeria Data Protection Act 2023 and any regulator
rules; counsel to confirm what applies):

10. Lawful basis for each use in the privacy notice, whether we must register
    as a data controller of major importance, appoint a data protection
    officer, or run an impact assessment.
11. Transfers outside Nigeria: the database is in Frankfurt (Supabase), the
    site is on Vercel, email goes through Resend, payments through Paystack.
    What do we need in place (contracts, notices)?
12. **Retention**: we have not built account deletion or set retention
    periods. The privacy draft has placeholders. Financial records must
    probably be kept for years; counsel to set the period.
13. Chat messages: we scan for phone numbers, emails and links to stop
    off-platform deals. Is the disclosure enough? How long may we keep
    messages?
14. Children and minimum age.

## What the product does that the documents depend on (so counsel can check)

- Signed-out visitors can see the creator directory with limited fields.
  Handles, bio and starting rate are shown only to signed-in businesses.
- Creators can opt out of search-engine indexing; profiles are drafts until
  published; admins can hide a profile.
- Follower counts are self-reported ranges unless "Verified" (an admin
  confirmed a code in the creator's bio).
- Chat messages containing contact details are not delivered and count as a
  strike (1 warning; 2 = three days without messaging, applying or hiring;
  3 = suspended until an admin reviews). One appeal a day.
- Blocking is person to person. It stops new messages and hires and changes
  nothing already agreed.
- We store a creator's bank name, last four digits, account name and the
  Paystack recipient code. The full account number goes to Paystack only.
- We use only the cookies the sign-in system needs. No analytics or
  advertising trackers are installed (checked 2026-11-17).

## After review

Replace the pages in `src/app/(marketing)/terms/page.tsx` and
`.../privacy/page.tsx` with the approved text, drop the draft banner and the
`noindex`, add both to `src/app/sitemap.ts`, and tick the items in
`docs/TODO.md` section 3. Re-check the terms whenever Stage 7 (disputes) or
wallet withdrawal ships.
