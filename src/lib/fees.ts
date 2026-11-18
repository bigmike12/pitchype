// Fee maths for the public site and for Stage 6 payments.
//
// These mirror the decided fees in CLAUDE.md §6.1. The rates and the transfer
// tiers below also seed `fee_config` in the database, where the real money
// maths runs (snapshotted onto each engagement at funding time). A test keeps
// the two equal, so change both together.
//
// Rates are basis points and amounts are integer kobo, so there is no float
// maths on stored money (CLAUDE.md §6 rule 1).

/** Business service fee, charged on top of the agreed price. 500 bps = 5%. */
export const BUSINESS_FEE_BPS = 500;

/** Influencer (creator) fee, deducted from the amount released to them. 500 bps = 5%. */
export const INFLUENCER_FEE_BPS = 500;

/** Minimum fee per side per job: ₦500. */
export const MIN_FEE_KOBO = 50_000;

/** Smallest payout a creator can request: ₦1,000. Seeds fee_config.min_payout_kobo. */
export const MIN_PAYOUT_KOBO = 100_000;

/** The worked example shown on the pricing section: a ₦50,000 job. */
export const EXAMPLE_PRICE_KOBO = 5_000_000;

const BPS_PER_WHOLE = 10_000;

/** Turns basis points into a percentage label, e.g. 500 → "5%". */
export function formatRate(bps: number): string {
  return `${bps / 100}%`;
}

function feeKobo(amountKobo: number, bps: number): number {
  return Math.max(MIN_FEE_KOBO, Math.round((amountKobo * bps) / BPS_PER_WHOLE));
}

export type FeeExample = {
  agreedPriceKobo: number;
  businessFeeKobo: number;
  businessPaysKobo: number;
  influencerFeeKobo: number;
  influencerReceivesKobo: number;
};

/** What each side pays or receives for a job at this agreed price, when the full amount is released. */
export function feeExample(agreedPriceKobo: number): FeeExample {
  if (!Number.isInteger(agreedPriceKobo) || agreedPriceKobo <= 0) {
    throw new Error(
      `Agreed price must be a positive whole number of kobo, got ${agreedPriceKobo}`,
    );
  }
  const businessFeeKobo = feeKobo(agreedPriceKobo, BUSINESS_FEE_BPS);
  const influencerFeeKobo = feeKobo(agreedPriceKobo, INFLUENCER_FEE_BPS);
  return {
    agreedPriceKobo,
    businessFeeKobo,
    businessPaysKobo: agreedPriceKobo + businessFeeKobo,
    influencerFeeKobo,
    influencerReceivesKobo: agreedPriceKobo - influencerFeeKobo,
  };
}

const KOBO_PER_HUNDRED_NAIRA = 10_000;

/**
 * For the landing page's budget calculator: the highest price per creator,
 * in whole hundreds of naira, such that `creators` jobs at that price, each
 * with the business fee on top, fit inside `budgetKobo`. 0 if nothing fits.
 * Display only, like everything in this file.
 */
export function pricePerCreatorWithin(
  budgetKobo: number,
  creators: number,
): number {
  if (!Number.isInteger(budgetKobo) || budgetKobo <= 0) {
    throw new Error(
      `Budget must be a positive whole number of kobo, got ${budgetKobo}`,
    );
  }
  if (!Number.isInteger(creators) || creators <= 0) {
    throw new Error(
      `Creators must be a positive whole number, got ${creators}`,
    );
  }
  const share = Math.floor(budgetKobo / creators);
  // The fee is a percentage unless that's under the minimum; try the
  // percentage first, then fall back to the flat minimum.
  const byRate = Math.floor(
    (share * BPS_PER_WHOLE) / (BPS_PER_WHOLE + BUSINESS_FEE_BPS),
  );
  let price =
    (byRate * BUSINESS_FEE_BPS) / BPS_PER_WHOLE >= MIN_FEE_KOBO
      ? byRate
      : share - MIN_FEE_KOBO;
  price = Math.floor(price / KOBO_PER_HUNDRED_NAIRA) * KOBO_PER_HUNDRED_NAIRA;
  // Rounding can leave a kobo or two over; step down until it fits.
  while (
    price > 0 &&
    creators * feeExample(price).businessPaysKobo > budgetKobo
  ) {
    price -= KOBO_PER_HUNDRED_NAIRA;
  }
  return Math.max(price, 0);
}

function requireWholeKobo(label: string, kobo: number, min: 0 | 1): void {
  if (!Number.isInteger(kobo) || kobo < min) {
    const kind = min === 1 ? "a positive" : "a non-negative";
    throw new Error(
      `${label} must be ${kind} whole number of kobo, got ${kobo}`,
    );
  }
}

// Paystack's published local card pricing: 1.5% + ₦100 (the ₦100 is waived
// under ₦2,500), the charge before VAT capped at ₦2,000, then 7.5% VAT.
// Source: https://support.paystack.com/hc/en-us/articles/360009881920
// Exported so a test can check they equal fee_config.paystack_rate.
export const PAYSTACK_RATE_BPS = 150;
export const PAYSTACK_FLAT_KOBO = 10_000;
export const PAYSTACK_FLAT_WAIVED_UNDER_KOBO = 250_000;
export const PAYSTACK_CAP_KOBO = 200_000;
export const PAYSTACK_VAT_BPS = 750;

/**
 * What Paystack takes (VAT included) when a business pays `chargedKobo`.
 * Rounded to whole kobo once, at the end. Paystack does not refund it.
 */
export function paystackCharge(chargedKobo: number): number {
  requireWholeKobo("Charged amount", chargedKobo, 1);
  // Work in units of 1/10,000 kobo so the percentage stays an integer until
  // the single rounding below.
  const flat =
    chargedKobo < PAYSTACK_FLAT_WAIVED_UNDER_KOBO ? 0 : PAYSTACK_FLAT_KOBO;
  const beforeVat = Math.min(
    chargedKobo * PAYSTACK_RATE_BPS + flat * BPS_PER_WHOLE,
    PAYSTACK_CAP_KOBO * BPS_PER_WHOLE,
  );
  return Math.round(
    (beforeVat * (BPS_PER_WHOLE + PAYSTACK_VAT_BPS)) /
      (BPS_PER_WHOLE * BPS_PER_WHOLE),
  );
}

/**
 * The fee taken from the influencer when `releasedKobo` is released to them:
 * a percentage with a minimum, but never more than the amount released, and
 * nothing when nothing is released (CLAUDE.md §6.1).
 */
export function creatorFee(
  releasedKobo: number,
  bps = INFLUENCER_FEE_BPS,
  minKobo = MIN_FEE_KOBO,
): number {
  requireWholeKobo("Released amount", releasedKobo, 0);
  requireWholeKobo("Creator fee rate (bps)", bps, 0);
  requireWholeKobo("Creator minimum fee", minKobo, 0);
  if (releasedKobo === 0) return 0;
  const byRate = Math.round((releasedKobo * bps) / BPS_PER_WHOLE);
  return Math.min(releasedKobo, Math.max(minKobo, byRate));
}

/**
 * What the business gets back when the influencer is at fault: the price plus
 * the business fee, minus Paystack's non-refundable charge (CLAUDE.md §6.2).
 * The charge is capped at the fee, as settle_money() does in the database, so
 * the business always gets at least the price back.
 */
export function faultRefund(
  priceKobo: number,
  businessFeeKobo: number,
  paystackFeesKobo: number,
): number {
  requireWholeKobo("Price", priceKobo, 1);
  requireWholeKobo("Business fee", businessFeeKobo, 0);
  requireWholeKobo("Paystack fees", paystackFeesKobo, 0);
  return (
    priceKobo + businessFeeKobo - Math.min(paystackFeesKobo, businessFeeKobo)
  );
}

/**
 * The business fee kept on a per-click hire (not at fault): 5% of what was
 * released to the creator, but never less than the minimum fee or Paystack's
 * charge on the payment that funded the hire, and never more than the fee
 * paid. The same rule as settle_money()'s per-click branch
 * (supabase/migrations/20261120100100_click_settlement.sql).
 */
export function clickFeeKept(input: {
  releasedKobo: number;
  businessFeeKobo: number;
  paystackChargeKobo: number;
  businessFeeBps?: number;
  minFeeKobo?: number;
}): number {
  const bps = input.businessFeeBps ?? BUSINESS_FEE_BPS;
  const min = input.minFeeKobo ?? MIN_FEE_KOBO;
  requireWholeKobo("Released amount", input.releasedKobo, 0);
  requireWholeKobo("Business fee", input.businessFeeKobo, 0);
  requireWholeKobo("Paystack charge", input.paystackChargeKobo, 0);
  const byRate = Math.round((input.releasedKobo * bps) / BPS_PER_WHOLE);
  return Math.min(
    input.businessFeeKobo,
    Math.max(byRate, min, input.paystackChargeKobo),
  );
}

/** Where a per-click hire's money goes when it settles for `billable` clicks. */
export function clickSettlement(input: {
  billable: number;
  cpcKobo: number;
  budgetKobo: number;
  businessFeeKobo: number;
  paystackChargeKobo: number;
  creatorFeeBps?: number;
  creatorMinFeeKobo?: number;
}) {
  const releasedKobo = Math.min(
    input.billable * input.cpcKobo,
    input.budgetKobo,
  );
  const creatorFeeKobo = creatorFee(
    releasedKobo,
    input.creatorFeeBps ?? INFLUENCER_FEE_BPS,
    input.creatorMinFeeKobo ?? MIN_FEE_KOBO,
  );
  const businessFeeKeptKobo = clickFeeKept({
    releasedKobo,
    businessFeeKobo: input.businessFeeKobo,
    paystackChargeKobo: input.paystackChargeKobo,
  });
  return {
    releasedKobo,
    creatorFeeKobo,
    creatorNetKobo: releasedKobo - creatorFeeKobo,
    businessFeeKeptKobo,
    businessBackKobo:
      input.budgetKobo -
      releasedKobo +
      (input.businessFeeKobo - businessFeeKeptKobo),
  };
}

// Paystack's Nigerian transfer fee by amount, paid by the influencer at cost.
// Source: https://support.paystack.com/hc/en-us/articles/360012276559-Transfers
// (checked 2026-11-13): up to ₦5,000 ₦10; ₦5,001 to ₦50,000 ₦25; above ₦50,000
// ₦50. The stamp duty below is separate and added on top.
export const TRANSFER_FEE_TIERS: { upToKobo: number; feeKobo: number }[] = [
  { upToKobo: 500_000, feeKobo: 1_000 },
  { upToKobo: 5_000_000, feeKobo: 2_500 },
  { upToKobo: Infinity, feeKobo: 5_000 },
];

// Flat stamp duty on transfers of ₦10,000 and over (Nigeria Tax Act 2025), from
// the same Paystack article: https://support.paystack.com/hc/en-us/articles/360012276559-Transfers
// and https://support.paystack.com/en/articles/7573314. Paystack passes it on
// and cannot refund it.
export const TRANSFER_STAMP_DUTY_KOBO = 5_000;
export const TRANSFER_STAMP_DUTY_FROM_KOBO = 1_000_000;

/**
 * The total the creator pays to send `amountKobo` to their bank: Paystack's
 * tier fee plus the flat stamp duty on transfers of ₦10,000 and over. The
 * payout screen shows this before they confirm (CLAUDE.md §6 rule 8).
 */
export function transferFee(amountKobo: number): number {
  requireWholeKobo("Transfer amount", amountKobo, 1);
  const tier = TRANSFER_FEE_TIERS.find((t) => amountKobo <= t.upToKobo);
  // The last tier is open-ended, so a tier always matches.
  const stampDuty =
    amountKobo >= TRANSFER_STAMP_DUTY_FROM_KOBO ? TRANSFER_STAMP_DUTY_KOBO : 0;
  return tier!.feeKobo + stampDuty;
}
