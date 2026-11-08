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
