import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_PAYOUT_KOBO, transferFee } from "./fees.ts";
import {
  adminPayoutStatus,
  describePayoutStatus,
  parsePayoutAmount,
  payoutPreview,
} from "./payout-request.ts";

test("whole naira amounts parse to kobo, with commas and a naira sign", () => {
  assert.deepEqual(parsePayoutAmount("1000"), { ok: true, kobo: 100_000 });
  assert.deepEqual(parsePayoutAmount("1,000"), { ok: true, kobo: 100_000 });
  assert.deepEqual(parsePayoutAmount("  ₦ 25,000 "), {
    ok: true,
    kobo: 2_500_000,
  });
  assert.deepEqual(parsePayoutAmount("₦1000"), { ok: true, kobo: 100_000 });
});

test("amounts that aren't whole naira numbers are refused", () => {
  for (const input of [
    "",
    "   ",
    "abc",
    "-5",
    "1e6",
    "1,000.50",
    "10.5",
    "1 000",
    "₦",
  ]) {
    const result = parsePayoutAmount(input);
    assert.equal(result.ok, false, `"${input}" should be refused`);
  }
});

test("zero and amounts under the minimum are refused with the minimum shown", () => {
  for (const input of ["0", "999", "1"]) {
    const result = parsePayoutAmount(input);
    assert.equal(result.ok, false, `"${input}" should be refused`);
    if (!result.ok) assert.match(result.error, /₦1,000/);
  }
  assert.equal(MIN_PAYOUT_KOBO, 100_000);
});

test("absurdly long numbers are refused", () => {
  assert.equal(parsePayoutAmount("1234567890123").ok, false);
  assert.equal(parsePayoutAmount("12345678901").ok, true);
});

test("the preview takes the transfer cost off what the creator receives", () => {
  assert.deepEqual(payoutPreview(100_000), {
    feeKobo: 1_000,
    receiveKobo: 99_000,
  });
  // ₦10,000 is ₦75: the ₦25 tier plus ₦50 stamp duty.
  assert.deepEqual(payoutPreview(1_000_000), {
    feeKobo: 7_500,
    receiveKobo: 992_500,
  });
  for (const amount of [
    100_000, 500_000, 500_001, 999_999, 5_000_000, 5_000_001,
  ]) {
    const fee = transferFee(amount);
    assert.deepEqual(payoutPreview(amount), {
      feeKobo: fee,
      receiveKobo: amount - fee,
    });
  }
});

test("the preview refuses when the fee would take everything", () => {
  assert.throws(() => payoutPreview(1_000));
});

test("every payout status has plain words", () => {
  const words = (status: string, decisionReason: string | null = null) =>
    describePayoutStatus({ status, decisionReason });

  assert.deepEqual(words("requested"), {
    label: "Waiting for approval",
    tone: "info",
    detail: "A member of our team approves each payout before it is sent.",
  });
  assert.deepEqual(words("processing"), {
    label: "Sent to your bank",
    tone: "info",
    detail: "It can take a few minutes to arrive.",
  });
  assert.deepEqual(words("paid"), {
    label: "Paid",
    tone: "success",
    detail: null,
  });
  assert.deepEqual(words("failed"), {
    label: "Didn’t go through",
    tone: "attention",
    detail: "The money is back in your wallet.",
  });
  assert.deepEqual(words("rejected", "Name doesn’t match."), {
    label: "Not approved",
    tone: "attention",
    detail: "Name doesn’t match. The money is back in your wallet.",
  });
  assert.equal(words("rejected").detail, "The money is back in your wallet.");
  assert.equal(words("mystery").label, "Status unknown");
});

test("admins read each payout status in words about the payout, not the creator", () => {
  assert.equal(adminPayoutStatus("requested"), "Waiting for approval");
  assert.equal(
    adminPayoutStatus("processing"),
    "Sent to Paystack, waiting for the bank",
  );
  assert.equal(adminPayoutStatus("paid"), "Paid");
  assert.equal(
    adminPayoutStatus("failed"),
    "Failed, money returned to the wallet",
  );
  assert.equal(
    adminPayoutStatus("rejected"),
    "Rejected, money returned to the wallet",
  );
  assert.equal(adminPayoutStatus("something_new"), "Status unknown");
});
