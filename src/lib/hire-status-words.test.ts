import assert from "node:assert/strict";
import { test } from "node:test";

import { describeHireStatus, type HireFacts } from "./hire-status-words.ts";

const NOW = new Date("2026-11-13T12:00:00Z");
const base: HireFacts = {
  status: "funded",
  creatorName: "Ada",
  payBy: "2026-11-14T12:00:00Z",
  cancelReason: null,
  fundedAt: "2026-11-13T09:00:00Z",
  settleOutcome: null,
  releasedKobo: null,
  refundedKobo: null,
  businessFeeKobo: 250_000,
};
const words = (over: Partial<HireFacts>) =>
  describeHireStatus({ ...base, ...over }, NOW);

test("a paid hire does not say 'Paid' twice", () => {
  const w = words({});
  assert.equal(w.title, "Paid");
  assert.ok(!w.body.startsWith("Paid"));
  assert.match(w.body, /Waiting for Ada to start/);
});

test("a refund that includes our fee says the card charge came off", () => {
  const fault = words({
    status: "refunded",
    settleOutcome: "refund_creator_fault",
    refundedKobo: 5_154_600,
  });
  assert.match(fault.body, /including our fee, less the card charge/);
  const pulledOut = words({
    status: "cancelled",
    cancelReason: "cancelled_by_creator",
    refundedKobo: 5_154_600,
  });
  assert.match(pulledOut.body, /including our fee, less the card charge/);
});

test("a release says what was released, not what the creator received", () => {
  const done = words({ status: "accepted", releasedKobo: 5_000_000 });
  assert.match(done.body, /₦50,000 was released to Ada/);
  assert.ok(!/has been paid/.test(done.body));
  const split = words({
    status: "accepted",
    settleOutcome: "split",
    releasedKobo: 2_000_000,
    refundedKobo: 3_000_000,
  });
  assert.match(split.body, /₦20,000 was released to Ada/);
  assert.match(split.body, /₦30,000 is back in your wallet/);
});

test("a plain business cancel keeps the fee", () => {
  const w = words({
    status: "cancelled",
    settleOutcome: "refund",
    refundedKobo: 5_000_000,
  });
  assert.match(w.body, /₦50,000 is back in your wallet/);
  assert.match(w.body, /Our fee of ₦2,500 isn’t refunded/);
});

test("an unpaid hire in time asks for payment; past its time it is waiting to lapse", () => {
  const waiting = words({ status: "awaiting_payment", fundedAt: null });
  assert.equal(waiting.canPay, true);
  assert.match(waiting.body, /Pay by/);

  const late = words({
    status: "awaiting_payment",
    fundedAt: null,
    payBy: "2026-11-13T11:59:00Z",
  });
  assert.equal(late.canPay, false);
  assert.equal(late.title, "Waiting to lapse");
  assert.match(
    late.body,
    /The time to pay has passed, so this hire will lapse shortly\./,
  );
  assert.ok(!/Pay by/.test(late.body));
});

test("every status has words", () => {
  for (const status of [
    "awaiting_payment",
    "funded",
    "in_progress",
    "submitted",
    "accepted",
    "denied",
    "paid_out",
    "disputed",
    "auto_released",
    "cancelled",
    "refunded",
  ]) {
    const w = words({ status });
    assert.ok(w.title.length > 0 && w.body.length > 0, status);
  }
});
