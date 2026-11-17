import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fitsRequestBudget,
  REQUEST_BUDGET_BYTES,
  TEXT_ALLOWANCE_BYTES,
} from "./proof-budget.ts";

const MB = 1024 * 1024;

test("no pictures and a few ordinary screenshots fit", () => {
  assert.equal(fitsRequestBudget([]), true);
  assert.equal(fitsRequestBudget([0.4 * MB, 0.5 * MB, 0.3 * MB]), true);
});

test("five busy 1.5 MB pictures do not fit", () => {
  assert.equal(fitsRequestBudget(Array(5).fill(1.5 * MB)), false);
});

test("the text allowance counts: the limit is exact", () => {
  const room = REQUEST_BUDGET_BYTES - TEXT_ALLOWANCE_BYTES;
  assert.equal(fitsRequestBudget([room]), true);
  assert.equal(fitsRequestBudget([room + 1]), false);
});

test("a picture sent unchanged counts at its full size", () => {
  // One undecodable 5 MB file is over on its own, whatever else is chosen.
  assert.equal(fitsRequestBudget([5 * MB, 0.1 * MB]), false);
});
