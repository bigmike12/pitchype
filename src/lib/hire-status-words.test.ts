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
  round: null,
  reviewDeadlineAt: null,
  roundsLeft: 3,
  openDisputeId: null,
  disputeAllowedFrom: null,
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

test("submitted before the deadline can be reviewed, with the date", () => {
  const w = words({
    status: "submitted",
    round: 1,
    reviewDeadlineAt: "2026-11-18T12:00:00Z",
  });
  assert.equal(w.title, "Waiting for your review");
  assert.match(w.body, /18 Nov/);
  assert.equal(w.canReview, true);
  assert.equal(w.canOpenDispute, false);
});

test("submitted after the deadline is being released, and can't be reviewed", () => {
  const w = words({
    status: "submitted",
    round: 1,
    reviewDeadlineAt: "2026-11-13T11:00:00Z",
  });
  assert.equal(
    w.body,
    "Review time ended on 13 Nov, 12:00. The money is being released.",
  );
  assert.equal(w.canReview, false);
});

test("denied: waiting for the creator, with rounds left; dispute allowed", () => {
  const w = words({ status: "denied", round: 1, roundsLeft: 3 });
  assert.equal(w.title, "Sent back");
  assert.match(w.body, /3 resubmissions left/);
  assert.equal(w.canReview, false);
  assert.equal(w.canOpenDispute, true);
  const none = words({ status: "denied", roundsLeft: 0 });
  assert.match(none.body, /no resubmissions left/);
  assert.equal(none.canOpenDispute, true);
  assert.equal(
    words({ status: "denied", openDisputeId: "d1" }).canOpenDispute,
    false,
  );
});

test("in progress: dispute only once the non-delivery date has passed", () => {
  assert.equal(words({ status: "in_progress" }).canOpenDispute, false);
  assert.equal(
    words({
      status: "in_progress",
      disputeAllowedFrom: "2026-11-14T00:00:00Z",
    }).canOpenDispute,
    false,
  );
  const late = words({
    status: "in_progress",
    disputeAllowedFrom: "2026-11-13T00:00:00Z",
  });
  assert.equal(late.canOpenDispute, true);
  assert.match(late.body, /open a dispute/);
});

test("disputed and auto-released have their own words", () => {
  const d = words({ status: "disputed", openDisputeId: "d1" });
  assert.equal(d.title, "Pitchype is reviewing this");
  assert.equal(d.canOpenDispute, false);
  assert.equal(d.canReview, false);
  const a = words({
    status: "auto_released",
    settleOutcome: "release",
    releasedKobo: 5_000_000,
  });
  assert.equal(a.title, "Released automatically");
  assert.match(a.body, /₦50,000 was released to Ada/);
  assert.equal(a.done, true);
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

// Pay per click ----------------------------------------------------------------------------

test("per click: the business sees clicks counting, then in, then a withdrawal", () => {
  const counting = {
    endsAt: "2026-11-20T00:00:00+01:00",
    settlesAt: "2026-11-23T00:00:00+01:00",
    stoppedAt: null,
  };
  const live = describeHireStatus(
    { ...base, status: "in_progress" },
    NOW,
    counting,
  );
  assert.equal(live.title, "Clicks counting");
  assert.match(live.body, /only for counted clicks/);
  assert.equal(live.canOpenDispute, false);

  const held = describeHireStatus({ ...base, status: "in_progress" }, NOW, {
    ...counting,
    endsAt: "2026-11-10T00:00:00+01:00",
  });
  assert.equal(held.title, "Clicks are in");
  assert.match(held.body, /settles on/);
  assert.equal(held.canOpenDispute, true);

  const withdrew = describeHireStatus({ ...base, status: "in_progress" }, NOW, {
    ...counting,
    stoppedAt: "2026-11-12T10:00:00Z",
  });
  assert.match(withdrew.title, /withdrew/);
  assert.equal(withdrew.canOpenDispute, false);
});
