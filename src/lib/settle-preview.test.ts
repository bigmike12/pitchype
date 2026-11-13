import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNairaAmount, settlePreview } from "./settle-preview.ts";

const base = {
  agreedPriceKobo: 5_000_000,
  releaseKobo: null,
  businessFeeKobo: 250_000,
  creatorFeeBps: 500,
  creatorMinFeeKobo: 50_000,
  paystackChargeKobo: null,
};

test("release in full: the creator gets the price less their fee", () => {
  const p = settlePreview({ ...base, outcome: "release" });
  assert.deepEqual(p, {
    ok: true,
    creatorGetsKobo: 4_750_000,
    creatorFeeKobo: 250_000,
    businessGetsBackKobo: 0,
    // Business fee ₦2,500 plus creator fee ₦2,500.
    platformKeepsKobo: 500_000,
    warning: null,
  });
});

test("refund in full: the price goes back and the business fee stays", () => {
  const p = settlePreview({ ...base, outcome: "refund" });
  assert.deepEqual(p, {
    ok: true,
    creatorGetsKobo: 0,
    creatorFeeKobo: 0,
    businessGetsBackKobo: 5_000_000,
    platformKeepsKobo: 250_000,
    warning: null,
  });
});

test("split: the released part pays the creator fee, the rest goes back", () => {
  const p = settlePreview({ ...base, outcome: "split", releaseKobo: 2_000_000 });
  assert.deepEqual(p, {
    ok: true,
    creatorGetsKobo: 1_900_000,
    creatorFeeKobo: 100_000,
    businessGetsBackKobo: 3_000_000,
    platformKeepsKobo: 350_000,
    warning: null,
  });
});

test("split needs an amount strictly between nothing and the price", () => {
  for (const releaseKobo of [null, 0, 5_000_000, 6_000_000, -100]) {
    const p = settlePreview({ ...base, outcome: "split", releaseKobo });
    assert.equal(p.ok, false, String(releaseKobo));
  }
});

test("split must be whole naira", () => {
  const p = settlePreview({ ...base, outcome: "split", releaseKobo: 2_000_050 });
  assert.equal(p.ok, false);
  if (!p.ok) assert.match(p.error, /whole number of naira/);
});

test("creator at fault: price plus our fee less the card charge", () => {
  const p = settlePreview({
    ...base,
    outcome: "refund_creator_fault",
    paystackChargeKobo: 95_406,
  });
  assert.deepEqual(p, {
    ok: true,
    creatorGetsKobo: 0,
    creatorFeeKobo: 0,
    businessGetsBackKobo: 5_154_594,
    // What is left of the business fee is the card charge Paystack kept.
    platformKeepsKobo: 95_406,
    warning: null,
  });
});

test("creator at fault: the card charge is capped at the business fee", () => {
  const p = settlePreview({
    ...base,
    outcome: "refund_creator_fault",
    paystackChargeKobo: 900_000,
  });
  assert.ok(p.ok);
  if (p.ok) assert.equal(p.businessGetsBackKobo, 5_000_000);
});

test("a charge that is not known counts as none, and the preview says so", () => {
  const p = settlePreview({ ...base, outcome: "refund_creator_fault" });
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.businessGetsBackKobo, 5_250_000);
    assert.match(p.warning ?? "", /card charge/);
  }
});

test("warns when the creator would receive nothing after the fee", () => {
  const p = settlePreview({
    ...base,
    agreedPriceKobo: 500_000,
    outcome: "split",
    releaseKobo: 30_000,
  });
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.creatorGetsKobo, 0);
    assert.equal(p.warning, "The creator would receive nothing after the fee.");
  }
});

test("parseNairaAmount reads whole naira with or without commas and ₦", () => {
  assert.deepEqual(parseNairaAmount("20,000"), { ok: true, kobo: 2_000_000 });
  assert.deepEqual(parseNairaAmount(" ₦ 300 "), { ok: true, kobo: 30_000 });
  assert.equal(parseNairaAmount("").ok, false);
  assert.equal(parseNairaAmount("0").ok, false);
  assert.equal(parseNairaAmount("12.50").ok, false);
  assert.equal(parseNairaAmount("-5").ok, false);
  assert.equal(parseNairaAmount("1".repeat(13)).ok, false);
});
