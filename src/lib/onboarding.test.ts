import assert from "node:assert/strict";
import { test } from "node:test";

import {
  afterProfileSteps,
  BUSINESS_STEPS,
  CREATOR_STEPS,
  stepInfo,
} from "./onboarding.ts";

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

test("with identity checks on, business steps count to five", () => {
  assert.deepEqual(stepInfo("business", "business-name", true), {
    number: 1,
    total: 5,
    backHref: null,
  });
  assert.deepEqual(stepInfo("business", "identity", true), {
    number: 4,
    total: 5,
    backHref: null,
  });
  assert.deepEqual(stepInfo("business", "done", true), {
    number: 5,
    total: 5,
    backHref: null,
  });
});

test("with identity checks on, creator steps link back, but never across profile creation", () => {
  assert.deepEqual(stepInfo("influencer", "niches", true), {
    number: 3,
    total: 7,
    backHref: null,
  });
  assert.equal(
    stepInfo("influencer", "platforms", true).backHref,
    "/onboarding/niches",
  );
  assert.equal(
    stepInfo("influencer", "photo", true).backHref,
    "/onboarding/platforms",
  );
  assert.deepEqual(stepInfo("influencer", "identity", true), {
    number: 6,
    total: 7,
    backHref: "/onboarding/photo",
  });
  assert.deepEqual(stepInfo("influencer", "done", true), {
    number: 7,
    total: 7,
    backHref: "/onboarding/identity",
  });
});

test("with identity checks off, there is no identity step", () => {
  assert.deepEqual(stepInfo("business", "location", false), {
    number: 3,
    total: 4,
    backHref: null,
  });
  assert.deepEqual(stepInfo("business", "done", false), {
    number: 4,
    total: 4,
    backHref: null,
  });
  assert.deepEqual(stepInfo("influencer", "photo", false), {
    number: 5,
    total: 6,
    backHref: "/onboarding/platforms",
  });
  assert.deepEqual(stepInfo("influencer", "done", false), {
    number: 6,
    total: 6,
    backHref: "/onboarding/photo",
  });
  assert.throws(() => stepInfo("influencer", "identity", false));
});

test("after the profile steps, onboarding goes to identity only while checks are on", () => {
  assert.equal(afterProfileSteps(true), "/onboarding/identity");
  assert.equal(afterProfileSteps(false), "/onboarding/done");
});
