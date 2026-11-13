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
    throw new Error(`${label} must be ${kind} whole number of kobo, got ${kobo}`);
  }
}

// Paystack's published local card pricing: 1.5% + ₦100 (the ₦100 is waived
// under ₦2,500), the charge before VAT capped at ₦2,000, then 7.5% VAT.
// Source: https://support.paystack.com/hc/en-us/articles/360009881920
const PAYSTACK_RATE_BPS = 150;
const PAYSTACK_FLAT_KOBO = 10_000;
const PAYSTACK_FLAT_WAIVED_UNDER_KOBO = 250_000;
const PAYSTACK_CAP_KOBO = 200_000;
const PAYSTACK_VAT_BPS = 750;

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
  if (releasedKobo === 0) return 0;
  const byRate = Math.round((releasedKobo * bps) / BPS_PER_WHOLE);
  return Math.min(releasedKobo, Math.max(minKobo, byRate));
}

/**
 * What the business gets back when the influencer is at fault: the price plus
 * the business fee, minus Paystack's non-refundable charge (CLAUDE.md §6.2).
 */
export function faultRefund(
  priceKobo: number,
  businessFeeKobo: number,
  paystackFeesKobo: number,
): number {
  requireWholeKobo("Price", priceKobo, 1);
  requireWholeKobo("Business fee", businessFeeKobo, 0);
  requireWholeKobo("Paystack fees", paystackFeesKobo, 0);
  return priceKobo + businessFeeKobo - paystackFeesKobo;
}

// Paystack's Nigerian transfer fee by amount, paid by the influencer at cost.
// Source: https://support.paystack.com/hc/en-us/articles/360012276559-Transfers
// (checked 2026-11-13): up to ₦5,000 ₦10; ₦5,001 to ₦50,000 ₦25; above ₦50,000
// ₦50. Paystack also charges ₦50 stamp duty on transfers of ₦10,000 and over;
// that is not in these tiers.
export const TRANSFER_FEE_TIERS: { upToKobo: number; feeKobo: number }[] = [
  { upToKobo: 500_000, feeKobo: 1_000 },
  { upToKobo: 5_000_000, feeKobo: 2_500 },
  { upToKobo: Infinity, feeKobo: 5_000 },
];

/** Paystack's transfer fee for sending `amountKobo` to a bank account. */
export function transferFee(amountKobo: number): number {
  requireWholeKobo("Transfer amount", amountKobo, 1);
  const tier = TRANSFER_FEE_TIERS.find((t) => amountKobo <= t.upToKobo);
  // The last tier is open-ended, so a tier always matches.
  return tier!.feeKobo;
}
