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
  assert.equal(isRefusal("release_invalid"), true);
  assert.equal(isRefusal("settle_reason_required"), true);
  assert.equal(isRefusal("fee_notice_required"), true);
  for (const code of [
    "identity_required",
    "already_verified",
    "check_in_review",
    "attempt_limit",
    "screening_hold",
    "no_bank_account",
    "payout_too_small",
    "payout_fee_too_high",
    "payout_not_enough_balance",
    "no_such_payout",
    "payout_not_pending",
    "payout_reason_required",
    "no_rounds_left",
    "review_closed",
    "proof_required",
    "proof_invalid",
    "reasons_required",
    "dispute_open",
    "not_your_file",
    "dispute_not_allowed_yet",
    "dispute_reason_invalid",
    "statement_invalid",
    "no_such_dispute",
    "dispute_closed",
  ]) {
    assert.equal(isRefusal(code), true, code);
  }
  assert.equal(isRefusal("invalid_bank_account"), false);
  assert.equal(isRefusal("invalid_outcome"), false);
  assert.equal(isRefusal("duplicate key value"), false);
});

test("the fee notice refusal tells the business what to tick", () => {
  assert.match(refusalText("fee_notice_required"), /fee/i);
});

test("an escrow that does not match the price points to the money trail", () => {
  assert.equal(isRefusal("escrow_mismatch"), true);
  assert.match(refusalText("escrow_mismatch"), /money trail/);
});
