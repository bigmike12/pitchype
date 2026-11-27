import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_PAYOUT_KOBO, transferFee } from "./fees.ts";
import {
  adminPayoutStatus,
  balanceShortfall,
  describePayoutStatus,
  parsePayoutAmount,
  payoutCheckOutcome,
  payoutPreview,
  transferRefusalWords,
} from "./payout-request.ts";

test("a payout is held when Paystack's balance is below what the transfer needs", () => {
  assert.equal(
    balanceShortfall(450_000, 450_000),
    null,
    "an exact balance is enough",
  );
  assert.equal(balanceShortfall(900_000, 450_000), null);
  const held = balanceShortfall(0, 450_000);
  assert.ok(held !== null, "an empty balance holds it");
  assert.match(held, /₦0/);
  assert.match(held, /₦4,500/);
  assert.match(held, /Nothing has been sent/);
});

test("Paystack's refusal is put in plain words for admins", () => {
  assert.match(
    transferRefusalWords("Insufficient balance"),
    /balance is too low/,
  );
  assert.match(
    transferRefusalWords("Balance not enough for transfer"),
    /balance is too low/,
  );
  assert.match(
    transferRefusalWords("OTP required to finalize transfer"),
    /transfer approval/,
  );
  // Seen in production 2026-11-27: the recipient was made with another key
  // (test mode), so live Paystack doesn't know it.
  assert.match(
    transferRefusalWords("Recipient specified is invalid"),
    /ask them to save it again/,
  );
  assert.match(
    transferRefusalWords("Recipient does not exist"),
    /ask them to save it again/,
  );
  assert.equal(
    transferRefusalWords("Something unexpected"),
    "Paystack did not take the transfer.",
  );
  assert.equal(
    transferRefusalWords(null),
    "Paystack did not take the transfer.",
  );
});

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

test("a live check with Paystack reads in calm words, never Paystack's", () => {
  assert.deepEqual(payoutCheckOutcome("paid"), {
    status: "success",
    message: "Paystack says it was sent. Marked paid.",
    changed: true,
  });
  assert.deepEqual(payoutCheckOutcome("failed"), {
    status: "success",
    message:
      "Paystack says it did not go through. The money is back in the creator’s wallet.",
    changed: true,
  });
  assert.deepEqual(payoutCheckOutcome("pending"), {
    status: "success",
    message: "Paystack hasn’t finished it yet.",
    changed: false,
  });
  assert.deepEqual(payoutCheckOutcome("not_sent_yet"), {
    status: "success",
    message:
      "Paystack has no transfer for this yet. Nothing changed. Check again once 15 minutes have passed since approval: if Paystack still has none, the money goes back to the creator’s wallet.",
    changed: false,
  });
  for (const result of ["duplicate", "ignored"] as const) {
    assert.deepEqual(payoutCheckOutcome(result), {
      status: "success",
      message: "Already up to date.",
      changed: false,
    });
  }
  assert.deepEqual(payoutCheckOutcome("unknown"), {
    status: "error",
    message: "Couldn’t find this transfer.",
    changed: false,
  });
});
