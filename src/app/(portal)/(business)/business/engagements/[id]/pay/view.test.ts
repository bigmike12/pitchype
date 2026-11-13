import assert from "node:assert/strict";
import { test } from "node:test";

import { payView } from "./view.ts";

const now = new Date("2026-11-13T12:00:00Z");
const unpaid = {
  status: "awaiting_payment",
  fundedAt: null,
  payBy: "2026-11-14T12:00:00Z",
  cancelReason: null,
};

test("an unpaid hire inside its 48 hours can be paid", () => {
  assert.equal(payView(unpaid, now), "waiting");
});

test("a hire that was ever paid goes to the hire page, whatever happened next", () => {
  const fundedAt = "2026-11-13T11:00:00Z";
  for (const [status, cancelReason] of [
    ["funded", null],
    ["in_progress", null],
    ["accepted", null],
    ["refunded", null],
    ["cancelled", "cancelled_by_business"],
    ["cancelled", "cancelled_by_creator"],
  ] as const) {
    assert.equal(
      payView({ ...unpaid, status, cancelReason, fundedAt }, now),
      "paid",
      `${status} ${cancelReason}`,
    );
  }
});

test("an unpaid hire the business cancelled says so", () => {
  assert.equal(
    payView(
      { ...unpaid, status: "cancelled", cancelReason: "cancelled_by_business" },
      now,
    ),
    "cancelled",
  );
});

test("an unpaid hire past its 48 hours lapsed, even before the job runs", () => {
  assert.equal(
    payView(
      { ...unpaid, status: "cancelled", cancelReason: "payment_expired" },
      now,
    ),
    "lapsed",
  );
  assert.equal(
    payView({ ...unpaid, payBy: "2026-11-13T11:59:59Z" }, now),
    "lapsed",
  );
});
