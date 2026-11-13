import assert from "node:assert/strict";
import { test } from "node:test";

import { viewFromHire, viewFromPaystackError, viewFromResult } from "./view.ts";

const hire = (status: string, cancelReason: string | null = null) => ({
  status,
  cancelReason,
});

test("a recorded payment is described by the hire's actual state", () => {
  assert.equal(viewFromHire(hire("funded"), true), "funded");
  assert.equal(viewFromHire(hire("in_progress"), true), "funded");
  assert.equal(
    viewFromHire(hire("cancelled", "payment_expired"), true),
    "lapsed",
  );
  assert.equal(viewFromHire(hire("awaiting_payment"), true), "stranded");
  for (const later of [
    hire("cancelled", "cancelled_by_business"),
    hire("cancelled", "cancelled_by_creator"),
    hire("refunded"),
    hire("accepted"),
  ]) {
    assert.equal(viewFromHire(later, true), "moved_on", later.status);
  }
});

test("never says 'can now start' for a payment that wasn't applied", () => {
  assert.equal(viewFromHire(hire("funded"), false), "checking");
  assert.equal(
    viewFromHire(hire("cancelled", "payment_expired"), false),
    "checking",
  );
});

test("a fresh confirm result maps to its message", () => {
  const waiting = hire("awaiting_payment");
  assert.equal(viewFromResult("funded", hire("funded"), true), "funded");
  assert.equal(
    viewFromResult("stranded", hire("cancelled", "payment_expired"), true),
    "lapsed",
  );
  assert.equal(viewFromResult("stranded", hire("funded"), true), "stranded");
  assert.equal(viewFromResult("pending", waiting, false), "pending");
  assert.equal(viewFromResult("failed", waiting, false), "failed");
  for (const result of ["mismatch", "unknown", "needs_review"] as const) {
    assert.equal(viewFromResult(result, waiting, false), "checking");
  }
  assert.equal(viewFromResult("duplicate", hire("refunded"), true), "moved_on");
  assert.equal(
    viewFromResult("duplicate", hire("in_progress"), true),
    "funded",
  );
});

test("only outages and rate limits promise a refresh", () => {
  for (const status of [0, 429, 500, 502, 503]) {
    assert.equal(viewFromPaystackError(status), "pending", String(status));
  }
  for (const status of [400, 401, 403, 404]) {
    assert.equal(viewFromPaystackError(status), "checking", String(status));
  }
});
