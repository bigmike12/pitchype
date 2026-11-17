import assert from "node:assert/strict";
import { test } from "node:test";

import {
  daysOpen,
  daysOpenWords,
  describeDisputeEnd,
  type DisputeMoney,
} from "./dispute-words.ts";

const names = { creator: "Ada", business: "Acme", opener: "Acme" };
const money: DisputeMoney = {
  releasedKobo: 5_000_000,
  refundedKobo: 0,
  creatorFeeBps: 500,
  creatorMinFeeKobo: 50_000,
};
const decided = (outcome: string) => ({
  status: "decided" as const,
  outcome,
  openedFrom: "denied" as const,
});

test("an open dispute has no ending", () => {
  assert.equal(
    describeDisputeEnd(
      { status: "open", outcome: null, openedFrom: "denied" },
      money,
      "admin",
      names,
    ),
    null,
  );
});

test("the ending is worded from the stored outcome and the hire's amounts", () => {
  const full = describeDisputeEnd(decided("release"), money, "admin", names);
  assert.equal(full?.title, "Decided for the creator");
  assert.match(full?.body ?? "", /₦50,000 was released to Ada/);

  const split = describeDisputeEnd(
    decided("split"),
    { ...money, releasedKobo: 2_000_000, refundedKobo: 3_000_000 },
    "business",
    names,
  );
  assert.match(split?.body ?? "", /₦20,000 was released to Ada/);
  assert.match(split?.body ?? "", /₦30,000 is back in your wallet/);

  const refund = describeDisputeEnd(
    decided("refund_creator_fault"),
    { ...money, releasedKobo: 0, refundedKobo: 5_100_000 },
    "admin",
    names,
  );
  assert.equal(refund?.title, "Decided for the business");
  assert.match(refund?.body ?? "", /₦51,000 went back to Acme/);
});

test("a creator is told what reached their wallet after the fee, never the gross", () => {
  const release = describeDisputeEnd(
    decided("release"),
    money,
    "creator",
    names,
  );
  assert.match(
    release?.body ?? "",
    /₦47,500 was added to your wallet after our fee/,
  );
  assert.doesNotMatch(release?.body ?? "", /50,000/);
  const refund = describeDisputeEnd(
    decided("refund"),
    { ...money, releasedKobo: 0, refundedKobo: 5_000_000 },
    "creator",
    names,
  );
  assert.match(refund?.body ?? "", /went back to the business/);
});

test("the business accepting during a dispute, and a withdrawal", () => {
  assert.equal(
    describeDisputeEnd(
      decided("accepted_by_business"),
      money,
      "business",
      names,
    )?.title,
    "The business accepted the work",
  );
  const withdrawn = describeDisputeEnd(
    { status: "withdrawn", outcome: null, openedFrom: "in_progress" },
    {
      releasedKobo: null,
      refundedKobo: null,
      creatorFeeBps: null,
      creatorMinFeeKobo: null,
    },
    "creator",
    names,
  );
  assert.match(
    withdrawn?.body ?? "",
    /Acme withdrew it\. .* in progress\. No money moved\./,
  );
});

test("days open", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  assert.equal(daysOpen("2026-11-17T08:00:00Z", now), 0);
  assert.equal(daysOpen("2026-11-14T12:00:00Z", now), 3);
  assert.equal(daysOpen("2026-11-18T12:00:00Z", now), 0);
  assert.equal(daysOpenWords("2026-11-17T08:00:00Z", now), "Opened today");
  assert.equal(daysOpenWords("2026-11-16T11:00:00Z", now), "Open 1 day");
  assert.equal(daysOpenWords("2026-11-10T12:00:00Z", now), "Open 7 days");
});
