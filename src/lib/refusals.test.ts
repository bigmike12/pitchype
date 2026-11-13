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
  assert.equal(isRefusal("payment_in_progress"), true);
  assert.equal(isRefusal("payment_mismatch"), true);
  assert.equal(isRefusal("not_enough_balance"), true);
  assert.equal(isRefusal("wallet_covers_total"), true);
  assert.equal(isRefusal("fee_notice_required"), false);
  assert.equal(isRefusal("duplicate key value"), false);
});
