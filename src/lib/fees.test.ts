import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUSINESS_FEE_BPS,
  EXAMPLE_PRICE_KOBO,
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  TRANSFER_FEE_TIERS,
  TRANSFER_STAMP_DUTY_KOBO,
  TRANSFER_STAMP_DUTY_FROM_KOBO,
  creatorFee,
  faultRefund,
  feeExample,
  formatRate,
  paystackCharge,
  pricePerCreatorWithin,
  transferFee,
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

test("CLAUDE.md §6.1 invariant: the business fee always beats Paystack's charge", () => {
  // From the ₦5,000 campaign minimum up to ₦10m, in ₦250 steps.
  for (let price = 500_000; price <= 1_000_000_000; price += 25_000) {
    const { businessFeeKobo, businessPaysKobo } = feeExample(price);
    const charge = paystackCharge(businessPaysKobo);
    assert.ok(
      businessFeeKobo > charge,
      `at ${formatNaira(price)} the fee ${formatNaira(businessFeeKobo)} must exceed Paystack's ${formatNaira(charge)}`,
    );
  }
  // The tightest case, spelled out: ₦5,000 + ₦500 fee; Paystack takes about ₦196.
  assert.equal(paystackCharge(550_000), 19_619);
});

test("budget split: ₦1M across 20 creators is ₦47,600 each, within budget", () => {
  const price = pricePerCreatorWithin(100_000_000, 20);
  assert.equal(price, 4_760_000);
  assert.ok(20 * feeExample(price).businessPaysKobo <= 100_000_000);
  // ₦100 more would go over.
  assert.ok(20 * feeExample(price + 10_000).businessPaysKobo > 100_000_000);
});

test("budget split: one creator gets nearly all of it", () => {
  const price = pricePerCreatorWithin(100_000_000, 1);
  assert.equal(price, 95_230_000);
  assert.ok(feeExample(price).businessPaysKobo <= 100_000_000);
});

test("budget split: small shares fall back to the ₦500 minimum fee", () => {
  // ₦100,000 / 20 = ₦5,000 each; 5% would be ₦238, so the fee is ₦500.
  const price = pricePerCreatorWithin(10_000_000, 20);
  assert.equal(price, 450_000);
  assert.equal(feeExample(price).businessPaysKobo, 500_000);
});

test("budget split: nothing fits when the share can't cover the minimum fee", () => {
  assert.equal(pricePerCreatorWithin(1_000_000, 30), 0);
});

test("budget split: rejects non-integer or non-positive inputs", () => {
  assert.throws(() => pricePerCreatorWithin(0, 5));
  assert.throws(() => pricePerCreatorWithin(100_000, 0));
  assert.throws(() => pricePerCreatorWithin(100.5, 1));
});

test("paystackCharge: ₦52,500 payment costs ₦954.06 including VAT (CLAUDE.md §6.4)", () => {
  // 1.5% of 5,250,000 = 78,750; + 10,000 flat = 88,750; x 1.075 = 95,406.25.
  assert.equal(paystackCharge(5_250_000), 95_406);
});

test("paystackCharge: no ₦100 component under ₦2,500", () => {
  // 1.5% of 200,000 = 3,000; x 1.075 = 3,225.
  assert.equal(paystackCharge(200_000), 3_225);
  // At exactly ₦2,500 the flat ₦100 applies: 3,750 + 10,000 = 13,750 x 1.075 = 14,781.25.
  assert.equal(paystackCharge(250_000), 14_781);
});

test("paystackCharge: the charge before VAT is capped at ₦2,000", () => {
  assert.equal(paystackCharge(1_000_000_000), 215_000);
});

test("paystackCharge: rejects amounts that aren't positive whole kobo", () => {
  assert.throws(() => paystackCharge(0));
  assert.throws(() => paystackCharge(-1));
  assert.throws(() => paystackCharge(10.5));
});

test("creatorFee: 5% of what's released, with the ₦500 minimum", () => {
  assert.equal(creatorFee(5_000_000), 250_000);
  // 5% of ₦10,000 is ₦500 exactly; ₦5,000 would be ₦250, lifted to the minimum.
  assert.equal(creatorFee(1_000_000), 50_000);
  assert.equal(creatorFee(500_000), 50_000);
});

test("creatorFee: zero released costs nothing, and the fee never exceeds the amount", () => {
  assert.equal(creatorFee(0), 0);
  assert.equal(creatorFee(30_000), 30_000);
});

test("creatorFee: a split release pays the fee on the released share only", () => {
  // Half of a ₦50,000 job released: 5% of ₦25,000.
  assert.equal(creatorFee(2_500_000), 125_000);
});

test("creatorFee: rejects negative or non-whole amounts", () => {
  assert.throws(() => creatorFee(-1));
  assert.throws(() => creatorFee(10.5));
});

test("creatorFee: rejects a rate or minimum that isn't a non-negative whole number", () => {
  assert.throws(() => creatorFee(5_000_000, -1));
  assert.throws(() => creatorFee(5_000_000, 2.5));
  assert.throws(() => creatorFee(5_000_000, Number.NaN));
  assert.throws(() => creatorFee(5_000_000, 500, -1));
  assert.throws(() => creatorFee(5_000_000, 500, 0.5));
  assert.equal(creatorFee(5_000_000, 0, 0), 0);
});

test("faultRefund: price plus business fee minus Paystack's charge (CLAUDE.md §6.2)", () => {
  assert.equal(faultRefund(5_000_000, 250_000, 95_406), 5_154_594);
});

test("faultRefund: Paystack's charge is capped at the business fee, as in settle_money()", () => {
  // A charge above the fee never takes from the price: the business gets at least the price back.
  assert.equal(faultRefund(5_000_000, 250_000, 300_000), 5_000_000);
  assert.equal(faultRefund(5_000_000, 250_000, 250_000), 5_000_000);
  assert.equal(faultRefund(5_000_000, 0, 95_406), 5_000_000);
  assert.equal(faultRefund(5_000_000, 250_000, 0), 5_250_000);
});

test("faultRefund: rejects invalid inputs", () => {
  assert.throws(() => faultRefund(0, 250_000, 95_406));
  assert.throws(() => faultRefund(5_000_000, -1, 95_406));
  assert.throws(() => faultRefund(5_000_000, 250_000, 0.5));
});

test("transferFee: the tier fee changes at ₦5,000 and ₦50,000", () => {
  assert.equal(transferFee(1), 1_000);
  assert.equal(transferFee(500_000), 1_000); // ₦5,000
  assert.equal(transferFee(500_001), 2_500); // just over ₦5,000
  assert.equal(transferFee(5_000_000), 2_500 + TRANSFER_STAMP_DUTY_KOBO); // ₦50,000
  assert.equal(transferFee(5_000_001), 5_000 + TRANSFER_STAMP_DUTY_KOBO); // just over ₦50,000
  assert.equal(transferFee(100_000_000), 5_000 + TRANSFER_STAMP_DUTY_KOBO);
});

test("transferFee: ₦50 stamp duty starts at exactly ₦10,000", () => {
  assert.equal(TRANSFER_STAMP_DUTY_KOBO, 5_000);
  assert.equal(TRANSFER_STAMP_DUTY_FROM_KOBO, 1_000_000);
  // Both sides of the threshold sit in the ₦25 tier.
  assert.equal(transferFee(999_999), 2_500);
  assert.equal(transferFee(1_000_000), 2_500 + 5_000);
  // One case per tier, below and above the threshold.
  assert.equal(transferFee(100_000), 1_000); // ₦1,000: ₦10 tier, no duty
  assert.equal(transferFee(2_000_000), 7_500); // ₦20,000: ₦25 tier + duty
  assert.equal(transferFee(10_000_000), 10_000); // ₦100,000: ₦50 tier + duty
});

test("transferFee: rejects amounts that aren't positive whole kobo", () => {
  assert.throws(() => transferFee(0));
  assert.throws(() => transferFee(-5));
  assert.throws(() => transferFee(10.5));
});

test("TRANSFER_FEE_TIERS is ordered, ends open-ended", () => {
  assert.equal(TRANSFER_FEE_TIERS.at(-1)?.upToKobo, Infinity);
  for (let i = 1; i < TRANSFER_FEE_TIERS.length; i++) {
    assert.ok(TRANSFER_FEE_TIERS[i].upToKobo > TRANSFER_FEE_TIERS[i - 1].upToKobo);
  }
});

test("business fee covers Paystack charge for every price", () => {
  // ₦5,000 to ₦1m in ₦100 steps, against the real charge function.
  for (let price = 500_000; price <= 100_000_000; price += 10_000) {
    const { businessFeeKobo, businessPaysKobo } = feeExample(price);
    const charge = paystackCharge(businessPaysKobo);
    assert.ok(
      businessFeeKobo >= charge,
      `at ${formatNaira(price)} the fee ${formatNaira(businessFeeKobo)} must cover Paystack's ${formatNaira(charge)}`,
    );
  }
});
