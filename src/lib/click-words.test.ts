import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blockedShareWarning,
  FILTER_REASONS,
  filterReasonText,
} from "./click-words.ts";

test("every reason a click didn't count has words", () => {
  assert.equal(FILTER_REASONS.length, 8);
  for (const reason of FILTER_REASONS) {
    assert.ok(filterReasonText(reason).length > 0, reason);
  }
  assert.equal(filterReasonText("repeat"), "Same person within 24 hours");
  assert.equal(filterReasonText("preview"), "Link preview, not a person");
});

test("a share on a blocked channel is named", () => {
  assert.equal(
    blockedShareWarning("whatsapp"),
    "A WhatsApp link preview opened this link, and this campaign blocks WhatsApp",
  );
  assert.ok(blockedShareWarning("instagram").startsWith("An Instagram"));
});
