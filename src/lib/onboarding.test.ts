import assert from "node:assert/strict";
import { test } from "node:test";

import { BUSINESS_STEPS, CREATOR_STEPS, stepInfo } from "./onboarding.ts";

test("the steps run in order", () => {
  assert.deepEqual(BUSINESS_STEPS, [
    "business-name",
    "contact-name",
    "location",
    "done",
  ]);
  assert.deepEqual(CREATOR_STEPS, [
    "display-name",
    "location",
    "niches",
    "platforms",
    "photo",
    "done",
  ]);
});

test("business steps count to four", () => {
  assert.deepEqual(stepInfo("business", "business-name"), {
    number: 1,
    total: 4,
    backHref: null,
  });
  assert.deepEqual(stepInfo("business", "done"), {
    number: 4,
    total: 4,
    backHref: null,
  });
});

test("creator steps link back, but never across profile creation", () => {
  assert.deepEqual(stepInfo("influencer", "niches"), {
    number: 3,
    total: 6,
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
  assert.deepEqual(stepInfo("influencer", "done"), {
    number: 6,
    total: 6,
    backHref: "/onboarding/photo",
  });
});
