# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two co-primary audiences, equal weight:

- **Creators:** micro and nano influencers, mainly in Nigeria and Africa, who
  want paid work from brands and a dependable way to get paid. Their job is to
  find campaigns that fit them, apply, do the work, and get paid.
- **Businesses:** brands and small businesses that hire creators, usually
  without an agency. Their job is to find the right creators, pay for work
  safely, and approve the result.

Admins are operators only (reviews, disputes, payouts, moderation). They are
not a design audience for the public surfaces.

## Product Purpose

Pitchype is a two-sided marketplace connecting businesses with micro and nano
influencers. Work starts in two ways: a business publishes a campaign that
influencers apply to, or a business browses creators and hires directly. Both
paths end in an engagement protected by escrow.

Success means a business pays for work it approved, a creator is paid for work
they delivered, and neither side has to trust the other with money directly.

## Positioning

Escrow is real and visible. A business's payment is held by Pitchype until the
work is accepted or auto-released after 7 days, and a creator's earnings are
shown before and after our fee, with the transfer cost shown before they
confirm a payout. A neighbouring marketplace can't truthfully claim that its
money trail is this legible to both sides.

## Operating Context

- Creators mostly use phones, often on slow or intermittent networks.
- Businesses usually work on a laptop, paying by card through Paystack.
- Money is shown in naira (₦), in whole kobo internally. Every amount on
  screen must match what the ledger recorded.
- Payouts go to a Nigerian bank account after Paystack resolves the name, and
  every payout is approved by an admin before the transfer is sent.

## Capabilities and Constraints

- Creator directory (signed-in businesses see rates and handles; the public
  sees less), campaigns with structured deliverables, applications, a
  48-hour pay window after approval, chat with contact-detail filtering,
  submission and review, escrow, wallets and payouts.
- Money is integer kobo only. The business pays the agreed price plus a 5%
  fee on top; the creator's 5% fee comes off their release, with a ₦500
  minimum. Payout transfer cost is paid by the creator.
- Test mode uses Paystack test keys; live payments are not yet enabled.
  Compliance review of holding third-party funds is open (see CLAUDE.md §6).
- Undecided: maximum resubmission rounds after a denial, the dispute process
  and timelines, pay-per-click campaigns (decided, not built), and whether
  businesses can withdraw wallet balance to a bank.

## Brand Commitments

- The name is **Pitchype**.
- Product principles: money safety is the product; both sides must win; fairness
  over cleverness in ranking, and paid placement is always labelled.
- Undecided: the copy voice. Not yet confirmed by the user; do not treat it as
  binding.

## Evidence on Hand

- `docs/creator-directory-decisions.md`, `docs/campaign-spec-decisions.md`,
  and `docs/superpowers/specs/` hold the decided rules.
- No customer testimonials, case studies, creator counts or statistics exist.
  Future work must not fabricate them (CLAUDE.md §3).
- Illustrations use fictional sample data marked "Sample".

## Product Principles

1. Money safety is the product: a money bug is a severity-one bug, always.
2. Both sides must win: no change that makes one side's economics worse without
   a matching benefit to the other.
3. Show the money trail: every amount a person sees ties to a ledger row they
   can open.
4. Staying on-platform is the better deal, not a forbidden one.
5. Suspension is not forfeiture: a restricted account keeps what it is owed.

## Accessibility & Inclusion

- Mobile first, designed at 390px before larger sizes.
- Works on slow networks: no heavy imagery or video backgrounds.
- Reduced motion must leave every page complete and readable.
- Baseline: WCAG 2.2 AA (labels, focus states, keyboard navigation, contrast).
