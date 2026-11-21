import assert from "node:assert/strict";
import { test } from "node:test";

import { IDENTITY_FIRST, identityBanner } from "./identity-gate.ts";

test("an unverified creator is told what they cannot do yet", () => {
  assert.equal(
    identityBanner("influencer", false),
    "Confirm your identity to apply for campaigns and withdraw your earnings",
  );
});

test("an unverified business is told what they cannot do yet", () => {
  assert.equal(
    identityBanner("business", false),
    "Confirm your identity to publish campaigns and hire creators",
  );
});

test("verified people and admins see no banner", () => {
  assert.equal(identityBanner("influencer", true), null);
  assert.equal(identityBanner("business", true), null);
  assert.equal(identityBanner("admin", false), null);
  assert.equal(identityBanner("admin", true), null);
});

test("the disabled-button words are short and plain", () => {
  assert.equal(IDENTITY_FIRST, "Confirm your identity first");
});
