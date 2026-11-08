import assert from "node:assert/strict";
import { test } from "node:test";

import { createRateLimiter } from "./rate-limit.ts";

test("allows up to the limit within the window, then blocks", () => {
  const isLimited = createRateLimiter({ maxAttempts: 3, windowMs: 1000 });
  assert.equal(isLimited("ip", 0), false);
  assert.equal(isLimited("ip", 10), false);
  assert.equal(isLimited("ip", 20), false);
  assert.equal(isLimited("ip", 30), true);
});

test("blocked attempts don't extend the block", () => {
  const isLimited = createRateLimiter({ maxAttempts: 1, windowMs: 1000 });
  assert.equal(isLimited("ip", 0), false);
  assert.equal(isLimited("ip", 500), true);
  assert.equal(isLimited("ip", 1001), false);
});

test("keys are counted separately", () => {
  const isLimited = createRateLimiter({ maxAttempts: 1, windowMs: 1000 });
  assert.equal(isLimited("a", 0), false);
  assert.equal(isLimited("b", 0), false);
  assert.equal(isLimited("a", 1), true);
});
