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
