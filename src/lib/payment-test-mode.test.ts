import assert from "node:assert/strict";
import { test } from "node:test";

import { isPaymentTestMode } from "./payment-test-mode.ts";

test("a Paystack test key is test mode, a live key is not", () => {
  assert.equal(isPaymentTestMode({ PAYSTACK_SECRET_KEY: "sk_test_abc" }), true);
  assert.equal(isPaymentTestMode({ PAYSTACK_SECRET_KEY: "sk_live_abc" }), false);
});

test("missing credentials count as test mode, so a live label is never wrong by default", () => {
  assert.equal(isPaymentTestMode({}), true);
});
