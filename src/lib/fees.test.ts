import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUSINESS_FEE_BPS,
  EXAMPLE_PRICE_KOBO,
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  feeExample,
  formatRate,
} from "./fees.ts";
import { formatNaira } from "./money.ts";

test("fee constants match CLAUDE.md §6.1 (5% each side, ₦500 minimum)", () => {
  assert.equal(BUSINESS_FEE_BPS, 500);
  assert.equal(INFLUENCER_FEE_BPS, 500);
  assert.equal(MIN_FEE_KOBO, 50_000);
  assert.equal(formatRate(BUSINESS_FEE_BPS), "5%");
});

test("₦50,000 job: business pays ₦52,500, creator receives ₦47,500", () => {
  assert.equal(EXAMPLE_PRICE_KOBO, 5_000_000);
  const example = feeExample(EXAMPLE_PRICE_KOBO);
  assert.deepEqual(example, {
    agreedPriceKobo: 5_000_000,
    businessFeeKobo: 250_000,
    businessPaysKobo: 5_250_000,
    influencerFeeKobo: 250_000,
    influencerReceivesKobo: 4_750_000,
  });
  assert.equal(formatNaira(example.businessPaysKobo), "₦52,500");
  assert.equal(formatNaira(example.influencerReceivesKobo), "₦47,500");
});

test("the ₦500 minimum fee applies to small jobs", () => {
  // 5% of ₦5,000 is ₦250, below the minimum.
  const example = feeExample(500_000);
  assert.equal(example.businessFeeKobo, MIN_FEE_KOBO);
  assert.equal(example.businessPaysKobo, 550_000);
  assert.equal(example.influencerReceivesKobo, 450_000);
});

test("fees round to the nearest kobo", () => {
  // 5% of ₦12,345.67 is 61,728.35 kobo.
  assert.equal(feeExample(1_234_567).businessFeeKobo, 61_728);
});

test("rejects prices that aren't positive whole kobo", () => {
  assert.throws(() => feeExample(0));
  assert.throws(() => feeExample(-100));
  assert.throws(() => feeExample(10.5));
});

test("formatNaira shows kobo only when present", () => {
  assert.equal(formatNaira(50_000), "₦500");
  assert.equal(formatNaira(123_456), "₦1,234.56");
  assert.throws(() => formatNaira(1.5));
});

// Paystack's published local card fee: 1.5% + ₦100 (the ₦100 is waived under
// ₦2,500), capped at ₦2,000, plus 7.5% VAT on the fee. Rounded up to the kobo.
// Only for this check; the real figure comes from Paystack in Stage 6.
function paystackChargeKobo(totalKobo: number): number {
  const flat = totalKobo < 250_000 ? 0 : 10_000;
  const fee = Math.min(Math.ceil((totalKobo * 150) / 10_000) + flat, 200_000);
  return Math.ceil((fee * 10_750) / 10_000);
}

test("CLAUDE.md §6.1 invariant: the business fee always beats Paystack's charge", () => {
  // From the ₦5,000 campaign minimum up to ₦10m, in ₦250 steps.
  for (let price = 500_000; price <= 1_000_000_000; price += 25_000) {
    const { businessFeeKobo, businessPaysKobo } = feeExample(price);
    const charge = paystackChargeKobo(businessPaysKobo);
    assert.ok(
      businessFeeKobo > charge,
      `at ${formatNaira(price)} the fee ${formatNaira(businessFeeKobo)} must exceed Paystack's ${formatNaira(charge)}`,
    );
  }
  // The tightest case, spelled out: ₦5,000 + ₦500 fee; Paystack takes about ₦196.
  assert.equal(paystackChargeKobo(550_000), 19_619);
});
