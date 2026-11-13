import assert from "node:assert/strict";
import { test } from "node:test";

import { fundingPaymentByHire } from "./funding-payment.ts";

const line = (
  engagementId: string,
  paymentId: string | null,
  createdAt: string,
  id: string,
) => ({ engagementId, paymentId, createdAt, id });

test("each hire maps to the payment on its earliest escrow funding line", () => {
  const map = fundingPaymentByHire([
    line("e1", "p-late", "2026-11-13T12:00:00Z", "l2"),
    line("e1", "p-first", "2026-11-13T09:00:00Z", "l1"),
    line("e2", "p-other", "2026-11-13T10:00:00Z", "l3"),
  ]);
  assert.equal(map.get("e1"), "p-first");
  assert.equal(map.get("e2"), "p-other");
});

test("lines written in the same instant are told apart by id, as the database does", () => {
  const map = fundingPaymentByHire([
    line("e1", "p-b", "2026-11-13T09:00:00Z", "b"),
    line("e1", "p-a", "2026-11-13T09:00:00Z", "a"),
  ]);
  assert.equal(map.get("e1"), "p-a");
});

test("a hire with no funding line is absent, and a line without a payment gives null", () => {
  const map = fundingPaymentByHire([
    line("e2", null, "2026-11-13T09:00:00Z", "l"),
  ]);
  assert.equal(map.has("e1"), false);
  assert.equal(map.get("e2"), null);
});
