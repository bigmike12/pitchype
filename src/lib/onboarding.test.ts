import assert from "node:assert/strict";
import { test } from "node:test";

import { BUSINESS_STEPS, CREATOR_STEPS, stepInfo } from "./onboarding.ts";

test("the steps run in order", () => {
  assert.deepEqual(BUSINESS_STEPS, [
    "business-name",
    "contact-name",
    "location",
    "identity",
    "done",
  ]);
  assert.deepEqual(CREATOR_STEPS, [
    "display-name",
    "location",
    "niches",
    "platforms",
    "photo",
    "identity",
    "done",
  ]);
});

test("business steps count to five", () => {
  assert.deepEqual(stepInfo("business", "business-name"), {
    number: 1,
    total: 5,
    backHref: null,
  });
  assert.deepEqual(stepInfo("business", "identity"), {
    number: 4,
    total: 5,
    backHref: null,
  });
  assert.deepEqual(stepInfo("business", "done"), {
    number: 5,
    total: 5,
    backHref: null,
  });
});

test("creator steps link back, but never across profile creation", () => {
  assert.deepEqual(stepInfo("influencer", "niches"), {
    number: 3,
    total: 7,
    backHref: null,
  });
  assert.equal(
    stepInfo("influencer", "platforms").backHref,
    "/onboarding/niches",
  );
  assert.equal(
    stepInfo("influencer", "photo").backHref,
    "/onboarding/platforms",
  );
  assert.deepEqual(stepInfo("influencer", "identity"), {
    number: 6,
    total: 7,
    backHref: "/onboarding/photo",
  });
  assert.deepEqual(stepInfo("influencer", "done"), {
    number: 7,
    total: 7,
    backHref: "/onboarding/identity",
  });
});
