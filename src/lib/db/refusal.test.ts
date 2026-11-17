import assert from "node:assert/strict";
import { test } from "node:test";

import { refused } from "./refusal.ts";

test("a known P0001 code is a refusal", () => {
  assert.deepEqual(
    refused({ code: "P0001", message: "campaign_full" }, "apply"),
    {
      ok: false,
      reason: "campaign_full",
    },
  );
});

test("only fee_notice_required is a refusal among 22023 errors", () => {
  assert.deepEqual(
    refused({ code: "22023", message: "fee_notice_required" }, "pay"),
    { ok: false, reason: "fee_notice_required" },
  );
  assert.throws(
    () => refused({ code: "22023", message: "invalid_outcome" }, "settle"),
    /settle failed \(22023\)/,
  );
  assert.throws(
    () =>
      refused({ code: "P0001", message: "fee_notice_required_extra" }, "pay"),
    /pay failed/,
  );
});

test("unknown errors throw with the code only", () => {
  assert.throws(
    () =>
      refused({ code: "08006", message: "connection lost: secret" }, "apply"),
    (error: Error) => error.message === "apply failed (08006)",
  );
});
