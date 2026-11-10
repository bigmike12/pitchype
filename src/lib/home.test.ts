import assert from "node:assert/strict";
import { test } from "node:test";

import type { CampaignStatus } from "./campaign.ts";
import {
  campaignAlerts,
  campaignCountsText,
  creatorChecklist,
} from "./home.ts";

const empty = {
  niches: [] as string[],
  platformCount: 0,
  hasPhoto: false,
  bio: null as string | null,
  startingRateKobo: null as number | null,
  published: false,
};

test("checklist order, links and completion", () => {
  const items = creatorChecklist(empty);
  assert.deepEqual(
    items.map((i) => [i.id, i.href, i.done]),
    [
      ["niches", "/onboarding/niches", false],
      ["platform", "/onboarding/platforms", false],
      ["photo", "/onboarding/photo", false],
      ["about", "/profile#about", false],
      ["publish", null, false],
    ],
  );

  const done = creatorChecklist({
    niches: ["food"],
    platformCount: 1,
    hasPhoto: true,
    bio: "Food reels",
    startingRateKobo: 1_000_000,
    published: true,
  });
  assert.ok(done.every((i) => i.done));
});

test("bio and rate count only together", () => {
  const about = (p: Partial<typeof empty>) =>
    creatorChecklist({ ...empty, ...p }).find((i) => i.id === "about")!.done;
  assert.equal(about({ bio: "Food reels" }), false);
  assert.equal(about({ startingRateKobo: 1_000_000 }), false);
  assert.equal(about({ bio: "Food reels", startingRateKobo: 1_000_000 }), true);
});

test("alerts: taken down, sent back, in review; newest first; at most three", () => {
  const c = (
    id: string,
    status: CampaignStatus,
    updatedAt: string,
    extra: { reviewNote?: string; removedReason?: string } = {},
  ) => ({
    id,
    title: id,
    status,
    reviewNote: null,
    removedReason: null,
    updatedAt,
    ...extra,
  });
  const alerts = campaignAlerts([
    c("live", "open", "2026-11-05T00:00:00Z"),
    c("review", "pending_review", "2026-11-04T00:00:00Z"),
    c("back", "draft", "2026-11-06T00:00:00Z", { reviewNote: "Add the price" }),
    c("down", "closed", "2026-11-07T00:00:00Z", {
      removedReason: "Banned product",
    }),
    c("plain-draft", "draft", "2026-11-08T00:00:00Z"),
    c("review2", "pending_review", "2026-11-01T00:00:00Z"),
  ]);
  assert.deepEqual(
    alerts.map((a) => [a.campaignId, a.kind, a.note]),
    [
      ["down", "taken_down", "Banned product"],
      ["back", "sent_back", "Add the price"],
      ["review", "in_review", null],
    ],
  );
});

test("counts read naturally and skip zeros", () => {
  assert.equal(
    campaignCountsText([
      { status: "open" },
      { status: "pending_review" },
      { status: "draft" },
    ]),
    "1 live · 1 in review · 1 draft",
  );
  assert.equal(
    campaignCountsText([{ status: "draft" }, { status: "draft" }]),
    "2 drafts",
  );
  assert.equal(
    campaignCountsText([{ status: "open" }, { status: "paused" }]),
    "1 live · 1 paused",
  );
  assert.equal(campaignCountsText([{ status: "closed" }]), "None live");
  assert.equal(campaignCountsText([]), "None yet");
});
