import assert from "node:assert/strict";
import { test } from "node:test";

import { isPaymentTestMode } from "./payment-test-mode.ts";

test("a Paystack test key is test mode, a live key is not", () => {
  assert.equal(
    isPaymentTestMode("paystack", { PAYSTACK_SECRET_KEY: "sk_test_abc" }),
    true,
  );
  assert.equal(
    isPaymentTestMode("paystack", { PAYSTACK_SECRET_KEY: "sk_live_abc" }),
    false,
  );
});

test("a Cray sandbox address is test mode, a production one is not", () => {
  assert.equal(
    isPaymentTestMode("cray", {
      CRAY_BASE_URL: "https://sandbox.cray.example",
    }),
    true,
  );
  assert.equal(
    isPaymentTestMode("cray", { CRAY_BASE_URL: "https://api.cray.example" }),
    false,
  );
});

test("missing credentials count as test mode, so a live label is never wrong by default", () => {
  assert.equal(isPaymentTestMode("paystack", {}), true);
  assert.equal(isPaymentTestMode("cray", {}), true);
});

test("only the active provider's credentials decide", () => {
  const env = {
    PAYSTACK_SECRET_KEY: "sk_live_abc",
    CRAY_BASE_URL: "https://sandbox.cray.example",
  };
  assert.equal(isPaymentTestMode("paystack", env), false);
  assert.equal(isPaymentTestMode("cray", env), true);
});
