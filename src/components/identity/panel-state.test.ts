import assert from "node:assert/strict";
import { test } from "node:test";

import { identityPanelState, type PanelCheck } from "./panel-state.ts";

const check = (
  kind: PanelCheck["kind"],
  status: PanelCheck["status"],
  createdAt = "2026-11-23T10:00:00Z",
): PanelCheck => ({ kind, status, createdAt });

test("no checks, or only abandoned and started ones, is none", () => {
  assert.equal(identityPanelState("influencer", [], false), "none");
  assert.equal(
    identityPanelState(
      "influencer",
      [check("creator_nin", "abandoned"), check("creator_nin", "started")],
      false,
    ),
    "none",
  );
});

test("a verified check of the role's kind is verified, whatever came after", () => {
  assert.equal(
    identityPanelState(
      "influencer",
      [
        check("creator_nin", "verified", "2026-11-20T10:00:00Z"),
        check("creator_nin", "failed", "2026-11-23T10:00:00Z"),
      ],
      false,
    ),
    "verified",
  );
  assert.equal(
    identityPanelState("business", [check("business_cac", "verified")], true),
    "verified",
  );
  assert.equal(
    identityPanelState("business", [check("owner_nin", "verified")], false),
    "verified",
  );
});

test("a check of another role's kind does not count", () => {
  assert.equal(
    identityPanelState("influencer", [check("owner_nin", "verified")], false),
    "none",
  );
  assert.equal(
    identityPanelState("business", [check("director_nin", "verified")], false),
    "none",
  );
});

test("pending is in progress, a held check is review", () => {
  assert.equal(
    identityPanelState("influencer", [check("creator_nin", "pending")], false),
    "in_progress",
  );
  assert.equal(
    identityPanelState(
      "influencer",
      [check("creator_nin", "needs_review")],
      false,
    ),
    "review",
  );
});

test("the latest answer decides between failed and an earlier one", () => {
  assert.equal(
    identityPanelState(
      "influencer",
      [
        check("creator_nin", "failed", "2026-11-22T10:00:00Z"),
        check("creator_nin", "abandoned", "2026-11-23T10:00:00Z"),
      ],
      false,
    ),
    "failed",
  );
  assert.equal(
    identityPanelState(
      "influencer",
      [
        check("creator_nin", "failed", "2026-11-22T10:00:00Z"),
        check("creator_nin", "pending", "2026-11-23T10:00:00Z"),
      ],
      false,
    ),
    "in_progress",
  );
});

test("the attempt cap overrides none and failed, never review or in progress", () => {
  assert.equal(identityPanelState("influencer", [], true), "capped");
  assert.equal(
    identityPanelState("influencer", [check("creator_nin", "failed")], true),
    "capped",
  );
  assert.equal(
    identityPanelState(
      "influencer",
      [check("creator_nin", "needs_review")],
      true,
    ),
    "review",
  );
});
