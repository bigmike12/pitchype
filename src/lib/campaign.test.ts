import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  deliverableText,
  lagosToday,
  maxSpend,
  creatorReceivesKobo,
  parseCampaignForm,
  parseLiveEditForm,
  problemText,
} from "./campaign.ts";

const NICHES = [
  "food-and-drinks",
  "fashion",
  "lifestyle",
  "travel",
  "gaming",
  "sports",
];
const TODAY = "2026-11-09";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

const COMPLETE: [string, string][] = [
  ["title", "  Zobo   launch reels "],
  ["brief", "Show our new hibiscus zobo to your followers."],
  ["guidelines", "Tag @brightside, use #ZoboSeason"],
  ["niches", "food-and-drinks"],
  ["niches", "lifestyle"],
  ["where", "states"],
  ["states", "Lagos"],
  ["states", "FCT"],
  ["deliverablePlatform", "instagram"],
  ["deliverableKind", "reel"],
  ["deliverableQuantity", "2"],
  ["deliverablePlatform", "tiktok"],
  ["deliverableKind", "video"],
  ["deliverableQuantity", "1"],
  ["deliverablePlatform", ""],
  ["deliverableKind", ""],
  ["deliverableQuantity", ""],
  ["minFollowers.instagram", "10k_50k"],
  ["minFollowers.tiktok", ""],
  ["verifiedOnly", "on"],
  ["price", "₦50,000"],
  ["places", "3"],
  ["applicationsCloseOn", "2026-11-20"],
  ["postFrom", "2026-11-21"],
  ["deliverBy", "2026-11-30"],
];

const without = (name: string) => COMPLETE.filter(([n]) => n !== name);
const replace = (name: string, value: string): [string, string][] => [
  ...without(name),
  [name, value],
];

test("a complete campaign form", () => {
  assert.deepEqual(parseCampaignForm(form(COMPLETE), NICHES, TODAY), {
    ok: true,
    value: {
      title: "Zobo launch reels",
      brief: "Show our new hibiscus zobo to your followers.",
      guidelines: "Tag @brightside, use #ZoboSeason",
      niches: ["food-and-drinks", "lifestyle"],
      states: ["Lagos", "FCT"],
      verifiedOnly: true,
      priceKobo: 5_000_000,
      places: 3,
      applicationsCloseOn: "2026-11-20",
      postFrom: "2026-11-21",
      deliverBy: "2026-11-30",
      platforms: [
        { platform: "instagram", minFollowers: "10k_50k" },
        { platform: "tiktok", minFollowers: null },
      ],
      deliverables: [
        { platform: "instagram", kind: "reel", quantity: 2 },
        { platform: "tiktok", kind: "video", quantity: 1 },
      ],
    },
  });
});

test("anywhere in Nigeria ignores ticked states", () => {
  const parsed = parseCampaignForm(
    form(replace("where", "anywhere")),
    NICHES,
    TODAY,
  );
  assert.equal(parsed.ok && parsed.value.states.length, 0);
});

test("deliverables: types must exist on the platform", () => {
  const xStory = parseCampaignForm(
    form([
      ...COMPLETE.filter(([n]) => !n.startsWith("deliverable")),
      ["deliverablePlatform", "x"],
      ["deliverableKind", "story"],
      ["deliverableQuantity", "1"],
    ]),
    NICHES,
    TODAY,
  );
  assert.equal(xStory.ok, false);
  assert.ok(!xStory.ok && xStory.errors.deliverables);

  const none = parseCampaignForm(
    form(COMPLETE.filter(([n]) => !n.startsWith("deliverable"))),
    NICHES,
    TODAY,
  );
  assert.equal(
    !none.ok && none.errors.deliverables,
    "Add at least one thing for creators to post.",
  );
});

test("price: whole naira, at least ₦5,000", () => {
  for (const [price, ok] of [
    ["5000", true],
    ["4,999", false],
    ["50000.50", false],
    ["", false],
  ] as const) {
    assert.equal(
      parseCampaignForm(form(replace("price", price)), NICHES, TODAY).ok,
      ok,
      price,
    );
  }
});

test("dates: not in the past, deliver-by after the deadline, post-from inside", () => {
  const past = parseCampaignForm(
    form(replace("applicationsCloseOn", "2026-11-08")),
    NICHES,
    TODAY,
  );
  assert.ok(!past.ok && past.errors.applicationsCloseOn);

  const early = parseCampaignForm(
    form(replace("deliverBy", "2026-11-19")),
    NICHES,
    TODAY,
  );
  assert.ok(!early.ok && early.errors.deliverBy);

  const late = parseCampaignForm(
    form(replace("postFrom", "2026-12-01")),
    NICHES,
    TODAY,
  );
  assert.ok(!late.ok && late.errors.postFrom);

  const noPostFrom = parseCampaignForm(
    form(replace("postFrom", "")),
    NICHES,
    TODAY,
  );
  assert.equal(noPostFrom.ok && noPostFrom.value.postFrom, null);
});

test("contact details are refused in briefs", () => {
  const parsed = parseCampaignForm(
    form(replace("brief", "Interested? WhatsApp 0803 123 4567 to join.")),
    NICHES,
    TODAY,
  );
  assert.match(
    !parsed.ok ? (parsed.errors.brief ?? "") : "",
    /Remove the phone number/,
  );
});

test("niches: up to five, from the list", () => {
  const six = parseCampaignForm(
    form([
      ...without("niches"),
      ...NICHES.map((n): [string, string] => ["niches", n]),
    ]),
    NICHES,
    TODAY,
  );
  assert.ok(!six.ok && six.errors.niches);
});

test("live edits: deadlines only move later", () => {
  const current = {
    applicationsCloseOn: "2026-11-20",
    deliverBy: "2026-11-30",
  };
  const base: [string, string][] = [
    ["title", "Zobo launch reels"],
    ["brief", "Show our new hibiscus zobo to your followers."],
    ["places", "4"],
  ];
  const later = parseLiveEditForm(
    form([
      ...base,
      ["applicationsCloseOn", "2026-11-25"],
      ["deliverBy", "2026-12-05"],
    ]),
    current,
  );
  assert.equal(later.ok, true);

  const earlier = parseLiveEditForm(
    form([
      ...base,
      ["applicationsCloseOn", "2026-11-19"],
      ["deliverBy", "2026-11-30"],
    ]),
    current,
  );
  assert.ok(!earlier.ok && earlier.errors.applicationsCloseOn);
});

test("money: maximum spend and what a creator receives", () => {
  // ₦50,000 x 3 places, each with a ₦2,500 fee.
  assert.deepEqual(maxSpend(5_000_000, 3), {
    feePerCreatorKobo: 250_000,
    perCreatorKobo: 5_250_000,
    totalKobo: 15_750_000,
  });
  // At the ₦5,000 minimum the ₦500 minimum fee applies.
  assert.equal(maxSpend(500_000, 1).feePerCreatorKobo, 50_000);
  assert.equal(creatorReceivesKobo(5_000_000), 4_750_000);
});

test("deliverables and problems read as plain sentences", () => {
  assert.equal(
    deliverableText({ platform: "instagram", kind: "reel", quantity: 2 }),
    "2 Instagram reels",
  );
  assert.equal(
    deliverableText({ platform: "youtube", kind: "short", quantity: 1 }),
    "1 YouTube Short",
  );
  const campaign = {
    nicheNames: ["Food and drinks", "Lifestyle"],
    states: ["Lagos", "FCT"] as const,
  };
  assert.equal(
    problemText(
      { code: "followers", platform: "instagram", minFollowers: "10k_50k" },
      { ...campaign, states: [...campaign.states] },
    ),
    "Needs 10K or more Instagram followers.",
  );
  assert.equal(
    problemText(
      { code: "niche" },
      { ...campaign, states: [...campaign.states] },
    ),
    "For food and drinks or lifestyle creators.",
  );
  assert.equal(
    problemText(
      { code: "state" },
      { ...campaign, states: [...campaign.states] },
    ),
    "For creators in Lagos or FCT (Abuja).",
  );
});

test("dates in Lagos", () => {
  // 23:30 UTC on the 9th is already the 10th in Lagos (UTC+1).
  assert.equal(lagosToday(new Date("2026-11-09T23:30:00Z")), "2026-11-10");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});
