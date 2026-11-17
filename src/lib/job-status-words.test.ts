import assert from "node:assert/strict";
import { test } from "node:test";

import { describeJobStatus, type JobFacts } from "./job-status-words.ts";

const NOW = new Date("2026-11-13T12:00:00Z");
const base: JobFacts = {
  status: "funded",
  cancelReason: null,
  fundedAt: "2026-11-13T09:00:00Z",
  startedAt: null,
  settledAt: null,
  settleOutcome: null,
  releasedKobo: null,
  refundedKobo: null,
  agreedPriceKobo: 5_000_000,
  creatorFeeBps: 500,
  creatorMinFeeKobo: 50_000,
  businessName: "Acme",
  payBy: "2026-11-14T12:00:00Z",
  round: null,
  reviewDeadlineAt: null,
  roundsLeft: 3,
  openDisputeId: null,
  disputeAllowedFrom: null,
};
const words = (over: Partial<JobFacts>) =>
  describeJobStatus({ ...base, ...over }, NOW);

test("waiting for payment: nothing to start yet", () => {
  const w = words({ status: "awaiting_payment", fundedAt: null });
  assert.equal(w.title, "Waiting for Acme to pay");
  assert.equal(w.body, "You can start once the payment is made.");
  assert.equal(w.canStart, false);
  assert.equal(w.canWithdraw, false);
});

test("after the pay-by time the job says it will lapse", () => {
  const w = words({
    status: "awaiting_payment",
    payBy: "2026-11-13T11:00:00Z",
  });
  assert.match(w.body, /will lapse shortly/);
});

test("paid: the creator can start or withdraw", () => {
  const w = words({});
  assert.equal(w.title, "Paid and held by Pitchype");
  assert.equal(w.body, "Acme has paid. You can start work.");
  assert.equal(w.canStart, true);
  assert.equal(w.canWithdraw, true);
});

test("in progress: the creator can send in the work or withdraw", () => {
  const w = words({ status: "in_progress", startedAt: "2026-11-13T10:00:00Z" });
  assert.equal(w.title, "Work in progress");
  assert.equal(w.canStart, false);
  assert.equal(w.canSubmit, true);
  assert.equal(w.canWithdraw, true);
  assert.equal(w.canResubmit, false);
  assert.equal(w.canOpenDispute, false);
});

test("submitted before the deadline waits for the business, with the date", () => {
  const w = words({
    status: "submitted",
    round: 1,
    reviewDeadlineAt: "2026-11-18T12:00:00Z",
  });
  assert.equal(w.title, "Waiting for Acme to review");
  assert.match(w.body, /18 Nov/);
  assert.equal(w.canSubmit, false);
  assert.equal(w.canResubmit, false);
  assert.equal(w.canWithdraw, false);
  assert.equal(w.canOpenDispute, false);
});

test("submitted after the deadline says the money is being released, not released", () => {
  const w = words({
    status: "submitted",
    round: 1,
    reviewDeadlineAt: "2026-11-13T11:00:00Z",
  });
  assert.equal(
    w.body,
    "Review time ended on 13 Nov, 12:00. The money is being released.",
  );
  assert.ok(!w.body.includes("was released"));
  assert.equal(w.canWithdraw, false);
});

test("denied with resubmissions left can fix and send again", () => {
  const w = words({ status: "denied", round: 2, roundsLeft: 2 });
  assert.equal(w.title, "Sent back");
  assert.match(w.body, /2 resubmissions left/);
  assert.equal(w.canResubmit, true);
  assert.equal(w.canWithdraw, true);
  assert.equal(w.canOpenDispute, true);
  assert.match(
    words({ status: "denied", roundsLeft: 1 }).body,
    /1 resubmission left/,
  );
});

test("denied with none left can only dispute or withdraw", () => {
  const w = words({ status: "denied", round: 4, roundsLeft: 0 });
  assert.equal(w.canResubmit, false);
  assert.equal(w.canOpenDispute, true);
  assert.equal(w.canWithdraw, true);
  assert.match(w.body, /No resubmissions left/);
});

test("disputed: Pitchype is reviewing, no actions", () => {
  const w = words({ status: "disputed", openDisputeId: "d1" });
  assert.equal(w.title, "Pitchype is reviewing this");
  assert.equal(w.canWithdraw, false);
  assert.equal(w.canOpenDispute, false);
  assert.equal(w.canResubmit, false);
  assert.equal(w.canSubmit, false);
});

test("released money says what reached the wallet after our fee", () => {
  for (const status of ["accepted", "paid_out"]) {
    const w = words({ status, releasedKobo: 5_000_000 });
    assert.equal(w.title, "Payment released");
    assert.equal(w.body, "₦47,500 was added to your wallet after our fee.");
  }
  const auto = words({ status: "auto_released", releasedKobo: 5_000_000 });
  assert.equal(auto.title, "Released automatically");
  assert.match(auto.body, /₦47,500 was added to your wallet after our fee/);
  // A split releases only part; the fee applies to that part.
  assert.equal(
    words({ status: "accepted", releasedKobo: 2_000_000 }).body,
    "₦19,000 was added to your wallet after our fee.",
  );
});

test("a refund went back to the business", () => {
  const w = words({ status: "refunded", refundedKobo: 5_000_000 });
  assert.equal(w.title, "Refunded to Acme");
  assert.equal(w.body, "This job ended and the payment went back to Acme.");
});

test("cancelled wording follows the reason", () => {
  assert.deepEqual(
    pick(
      words({
        status: "cancelled",
        fundedAt: null,
        cancelReason: "payment_expired",
      }),
    ),
    ["This job lapsed", "Acme didn’t pay in time."],
  );
  for (const fundedAt of [null, "2026-11-13T09:00:00Z"]) {
    assert.equal(
      words({
        status: "cancelled",
        fundedAt,
        cancelReason: "cancelled_by_business",
      }).title,
      "Acme cancelled this job",
    );
  }
  assert.equal(
    words({ status: "cancelled", cancelReason: "cancelled_by_creator" }).title,
    "You withdrew from this job",
  );
});

test("a business cancelling says whether anything was paid", () => {
  assert.equal(
    words({
      status: "cancelled",
      fundedAt: null,
      cancelReason: "cancelled_by_business",
    }).body,
    "Nothing was paid.",
  );
  assert.equal(
    words({ status: "cancelled", cancelReason: "cancelled_by_business" }).body,
    "The payment went back to Acme.",
  );
});

test("ended jobs offer no actions", () => {
  for (const over of [
    { status: "refunded" },
    { status: "cancelled", cancelReason: "cancelled_by_business" },
    { status: "cancelled", cancelReason: "cancelled_by_creator" },
    { status: "cancelled", fundedAt: null, cancelReason: "payment_expired" },
  ]) {
    const w = words(over);
    assert.equal(w.canStart, false);
    assert.equal(w.canWithdraw, false);
  }
});

function pick(w: { title: string; body: string }) {
  return [w.title, w.body];
}

test("what the creator would receive for the full price", () => {
  assert.equal(words({}).youReceiveKobo, 4_750_000);
  // Snapshot values win over the constants.
  assert.equal(
    words({ creatorFeeBps: 1_000, creatorMinFeeKobo: 10_000 }).youReceiveKobo,
    4_500_000,
  );
  // No snapshot yet: today's rates.
  assert.equal(
    words({ creatorFeeBps: null, creatorMinFeeKobo: null }).youReceiveKobo,
    4_750_000,
  );
  // The minimum fee applies to small jobs.
  assert.equal(words({ agreedPriceKobo: 500_000 }).youReceiveKobo, 450_000);
});
