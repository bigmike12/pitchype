import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeSettlePreview,
  parseNairaAmount,
  settlePreview,
} from "./settle-preview.ts";

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
  const p = settlePreview({
    ...base,
    outcome: "split",
    releaseKobo: 2_000_000,
  });
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
  const p = settlePreview({
    ...base,
    outcome: "split",
    releaseKobo: 2_000_050,
  });
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

test("when the funding payment cannot be found the charge counts as none and the preview says so", () => {
  const p = settlePreview({ ...base, outcome: "refund_creator_fault" });
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.businessGetsBackKobo, 5_250_000);
    assert.match(p.warning ?? "", /couldn’t be found/);
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

test("a hire with two succeeded payments refunds by the funding payment's charge only", () => {
  // A late, stranded second payment (charge ₦1,000) went to the business
  // wallet; settle_money subtracts only the funding payment's ₦954.06 charge.
  // The caller passes that one charge, so the preview matches the database.
  const p = settlePreview({
    ...base,
    outcome: "refund_creator_fault",
    paystackChargeKobo: 95_406,
  });
  assert.ok(p.ok);
  if (p.ok) assert.equal(p.businessGetsBackKobo, 5_154_594);
});

test("a wallet-only funding payment has no card charge, so the business gets price plus fee", () => {
  const p = settlePreview({
    ...base,
    outcome: "refund_creator_fault",
    paystackChargeKobo: 0,
  });
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.businessGetsBackKobo, 5_250_000);
    assert.equal(p.platformKeepsKobo, 0);
    assert.equal(p.warning, null);
  }
});

test("the form's preview line, problem and warning", () => {
  const facts = {
    agreedPriceKobo: 5_000_000,
    businessFeeKobo: 250_000,
    creatorFeeBps: 500,
    creatorMinFeeKobo: 50_000,
    paystackChargeKobo: 154_600,
  };
  // Nothing chosen yet: nothing to show.
  assert.deepEqual(describeSettlePreview("", "", facts), {
    line: null,
    problem: null,
    warning: null,
  });
  const release = describeSettlePreview("release", "", facts);
  assert.equal(
    release.line,
    "Creator receives ₦47,500 after their ₦2,500 fee · Business gets back ₦0 · Pitchype keeps ₦5,000",
  );
  // A split waits for an amount without complaining about the empty box.
  assert.deepEqual(describeSettlePreview("split", "  ", facts), {
    line: null,
    problem: null,
    warning: null,
  });
  assert.equal(
    describeSettlePreview("split", "abc", facts).problem,
    "Enter a whole number of naira, like 20,000.",
  );
  assert.match(
    describeSettlePreview("split", "50,000", facts).problem ?? "",
    /releases part of the price/,
  );
  assert.match(
    describeSettlePreview("split", "20,000", facts).line ?? "",
    /Creator receives ₦19,000 after their ₦1,000 fee · Business gets back ₦30,000/,
  );
  assert.match(
    describeSettlePreview("refund_creator_fault", "", {
      ...facts,
      paystackChargeKobo: null,
    }).warning ?? "",
    /couldn’t be found/,
  );
});

test("per click: a release pays the clicks counted, and most of the fee goes back", () => {
  const facts = {
    agreedPriceKobo: 2_500_000,
    businessFeeKobo: 125_000,
    creatorFeeBps: 500,
    creatorMinFeeKobo: 50_000,
    paystackChargeKobo: 53_078,
    clickEarnedKobo: 1_000_000,
  };
  const release = settlePreview({
    ...facts,
    outcome: "release",
    releaseKobo: null,
  });
  assert.deepEqual(
    release.ok && [release.creatorGetsKobo, release.businessGetsBackKobo],
    [950_000, 1_500_000 + 125_000 - 53_078],
  );
  const refund = settlePreview({
    ...facts,
    outcome: "refund",
    releaseKobo: null,
  });
  assert.deepEqual(
    refund.ok && refund.businessGetsBackKobo,
    2_500_000 + 125_000 - 53_078,
  );
  const split = settlePreview({
    ...facts,
    outcome: "split",
    releaseKobo: 400_000,
  });
  assert.deepEqual(
    split.ok && split.businessGetsBackKobo,
    2_100_000 + 125_000 - 53_078,
  );
  assert.deepEqual(split.ok && split.platformKeepsKobo, 53_078 + 50_000);
});
