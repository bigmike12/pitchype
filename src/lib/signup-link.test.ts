import assert from "node:assert/strict";
import { test } from "node:test";

import { signupHrefFor } from "./signup-link.ts";

test("signupHrefFor picks the role from the audience page", () => {
  for (const path of ["/for-business", "/for-business/", "/for-business/ugc"]) {
    assert.equal(signupHrefFor(path), "/signup?role=business", path);
  }
  for (const path of ["/for-creators", "/for-creators/"]) {
    assert.equal(signupHrefFor(path), "/signup?role=influencer", path);
  }
  // Whole path segments only, like the proxy's isUnder().
  for (const path of [
    "/",
    "/creators",
    "/creators/ada",
    "/for-businesses",
    "/for-business-x",
    "/business/campaigns",
    "",
  ]) {
    assert.equal(signupHrefFor(path), "/signup", path);
  }
});
