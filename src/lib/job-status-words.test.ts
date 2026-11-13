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

test("in progress: no actions", () => {
  const w = words({ status: "in_progress", startedAt: "2026-11-13T10:00:00Z" });
  assert.equal(w.title, "Work in progress");
  assert.equal(w.canStart, false);
  assert.equal(w.canWithdraw, false);
});

test("submitted, denied and disputed have their own words", () => {
  assert.equal(
    words({ status: "submitted" }).body,
    "Your submission is with Acme.",
  );
  assert.equal(words({ status: "denied" }).body, "Acme sent it back.");
  assert.equal(words({ status: "disputed" }).body, "This job is under review.");
  for (const status of ["submitted", "denied", "disputed"]) {
    const w = words({ status });
    assert.equal(w.canStart, false);
    assert.equal(w.canWithdraw, false);
    assert.ok(w.title.length > 0);
    assert.ok(!w.body.includes("isn’t open yet"));
  }
});

test("released money says what reached the wallet after our fee", () => {
  for (const status of ["accepted", "auto_released", "paid_out"]) {
    const w = words({ status, releasedKobo: 5_000_000 });
    assert.equal(w.title, "Payment released");
    assert.equal(w.body, "₦47,500 was added to your wallet after our fee.");
  }
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
