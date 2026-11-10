// Display-only fee figures for the public site.
//
// These mirror the decided fees in CLAUDE.md §6.1. Nothing here moves money:
// when payments are built, the real fee rules live in the database
// (`fee_config`, snapshotted onto each engagement at funding time). Keep the
// two in step until then.
//
// Rates are basis points and amounts are integer kobo, so there is no float
// maths on money even for display (CLAUDE.md §6 rule 1).

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
