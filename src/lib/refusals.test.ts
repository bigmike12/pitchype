import assert from "node:assert/strict";
import { test } from "node:test";

import { REFUSALS, isRefusal, refusalText } from "./refusals.ts";

test("every refusal the database can give has words", () => {
  for (const reason of REFUSALS) {
    assert.ok(refusalText(reason).length > 10, reason);
  }
});

test("only known codes count as refusals", () => {
  assert.equal(isRefusal("campaign_full"), true);
  assert.equal(isRefusal("appeal_too_soon"), true);
  assert.equal(isRefusal("duplicate key value"), false);
});
