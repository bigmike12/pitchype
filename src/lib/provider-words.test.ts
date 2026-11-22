import assert from "node:assert/strict";
import { test } from "node:test";

import { payoutFlagWords, providerName } from "./provider-words.ts";

test("providers have their own names, for admin pages only", () => {
  assert.equal(providerName("cray"), "Cray");
  assert.equal(providerName("paystack"), "Paystack");
});

test("a payout waiting for funds says nothing was sent", () => {
  const words = payoutFlagWords({
    waitingForFunds: true,
    needsReference: false,
  });
  assert.match(words ?? "", /nothing was sent/i);
  assert.match(words ?? "", /balance/i);
});

test("a payout that needs a reference says it may already have gone out", () => {
  const words = payoutFlagWords({
    waitingForFunds: false,
    needsReference: true,
  });
  assert.match(words ?? "", /may (already )?have/i);
  assert.match(words ?? "", /reference/i);
});

test("a payout with neither flag has no extra words", () => {
  assert.equal(
    payoutFlagWords({ waitingForFunds: false, needsReference: false }),
    null,
  );
});
