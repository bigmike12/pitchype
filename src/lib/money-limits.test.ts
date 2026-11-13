import assert from "node:assert/strict";
import { test } from "node:test";

import { isBankCheckLimited, isPayoutLimited } from "./money-limits.ts";

const START = Date.parse("2026-11-13T12:00:00Z");
const MINUTE = 60 * 1000;

test("the 11th bank check in an hour is limited, and it frees up after the hour", () => {
  for (let i = 0; i < 10; i += 1) {
    assert.equal(isBankCheckLimited("bank-user", START + i * MINUTE), false);
  }
  assert.equal(isBankCheckLimited("bank-user", START + 10 * MINUTE), true);
  // The first attempt was at START, so an hour later there's room again.
  assert.equal(isBankCheckLimited("bank-user", START + 60 * MINUTE + 1), false);
});

test("bank limits are per person", () => {
  for (let i = 0; i < 10; i += 1) isBankCheckLimited("busy", START);
  assert.equal(isBankCheckLimited("busy", START), true);
  assert.equal(isBankCheckLimited("someone-else", START), false);
});

test("the 6th payout request in ten minutes is limited", () => {
  for (let i = 0; i < 5; i += 1) {
    assert.equal(isPayoutLimited("payout-user", START + i * MINUTE), false);
  }
  assert.equal(isPayoutLimited("payout-user", START + 5 * MINUTE), true);
  assert.equal(isPayoutLimited("payout-user", START + 10 * MINUTE + 1), false);
});
