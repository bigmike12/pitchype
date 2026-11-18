import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  checkDestinationUrl,
  clickWindowEnded,
  deliverableText,
  maxClicks,
  lagosToday,
  maxSpend,
  creatorReceivesKobo,
  parseCampaignForm,
  parseLiveEditForm,
  problemText,
  campaignGroup,
  placesLeftText,
  placesStatus,
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
      paymentModel: "fixed",
      cpcKobo: null,
      destinationUrl: null,
      utmTags: true,
      blockedChannels: [],
    },
  });
});

// Pay per click ------------------------------------------------------------------------

const PER_CLICK: [string, string][] = [
  ...COMPLETE.filter(([n]) => n !== "price"),
  ["payment_model", "per_click"],
  ["cpc", "50"],
  ["price", "25,000"],
  ["destination_url", "https://www.konga.com/xmas?ref=a"],
  ["blocked_channels", "whatsapp"],
  ["blocked_channels", "telegram"],
];
const perClickWith = (name: string, value: string | null) => {
  const rest = PER_CLICK.filter(([n]) => n !== name);
  return value === null ? rest : [...rest, [name, value] as [string, string]];
};

test("a per-click campaign form", () => {
  const parsed = parseCampaignForm(
    form([...PER_CLICK, ["utm_tags", "on"]]),
    NICHES,
    TODAY,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.paymentModel, "per_click");
  assert.equal(parsed.value.cpcKobo, 5_000);
  assert.equal(parsed.value.priceKobo, 2_500_000);
  assert.equal(parsed.value.destinationUrl, "https://www.konga.com/xmas?ref=a");
  assert.deepEqual(parsed.value.blockedChannels, ["whatsapp", "telegram"]);
  assert.equal(parsed.value.utmTags, true);

  const noTags = parseCampaignForm(form(PER_CLICK), NICHES, TODAY);
  assert.equal(noTags.ok && noTags.value.utmTags, false);
});

test("per click: at least ₦50 a click, whole naira", () => {
  for (const cpc of ["49", "50.5", "", "abc"]) {
    const parsed = parseCampaignForm(
      form(perClickWith("cpc", cpc)),
      NICHES,
      TODAY,
    );
    assert.equal(parsed.ok, false, cpc);
    assert.ok(!parsed.ok && parsed.errors.cpc, cpc);
  }
});

test("per click: the budget per creator is a whole number of clicks", () => {
  const parsed = parseCampaignForm(
    form(perClickWith("price", "25,020")),
    NICHES,
    TODAY,
  );
  assert.ok(
    !parsed.ok && parsed.errors.price?.includes("whole number of clicks"),
  );
});

test("per click: blocked channels come from the list", () => {
  const parsed = parseCampaignForm(
    form([...PER_CLICK, ["blocked_channels", "signal"]]),
    NICHES,
    TODAY,
  );
  assert.ok(!parsed.ok && parsed.errors.blockedChannels);
});

test("per click: a bad destination is refused", () => {
  const parsed = parseCampaignForm(
    form(perClickWith("destination_url", "http://konga.com")),
    NICHES,
    TODAY,
  );
  assert.ok(!parsed.ok && parsed.errors.destinationUrl);
});

test("fixed price ignores posted per-click fields", () => {
  const parsed = parseCampaignForm(
    form([
      ...COMPLETE,
      ["payment_model", "fixed"],
      ["cpc", "50"],
      ["destination_url", "https://www.konga.com/"],
      ["blocked_channels", "whatsapp"],
    ]),
    NICHES,
    TODAY,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.paymentModel, "fixed");
  assert.equal(parsed.value.cpcKobo, null);
  assert.equal(parsed.value.destinationUrl, null);
  assert.deepEqual(parsed.value.blockedChannels, []);
});

test("destination links: https, a real host, no shorteners", () => {
  assert.deepEqual(checkDestinationUrl("https://www.konga.com/xmas?ref=a"), {
    url: "https://www.konga.com/xmas?ref=a",
  });
  for (const bad of [
    "http://konga.com",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://localhost/x",
    "https://konga.com:8443/",
    "https://u:p@konga.com/",
    "javascript:alert(1)",
    "https://bit.ly/abc",
    "https://tinyurl.com/x",
    "https://t.co/x",
    "https://konga.com/" + "a".repeat(2_000),
    "",
  ]) {
    const result = checkDestinationUrl(bad);
    assert.ok("error" in result && result.error.length > 0, bad);
  }
});

test("destination links are stored normalised", () => {
  assert.deepEqual(checkDestinationUrl("https://jumia.com.ng/₦-deals"), {
    url: "https://jumia.com.ng/%E2%82%A6-deals",
  });
  for (const spelling of [
    "HTTPS://konga.com/x",
    "https:konga.com/x",
    "https:\\konga.com/x",
  ]) {
    const result = checkDestinationUrl(spelling);
    assert.ok(
      "url" in result && result.url.startsWith("https://konga.com/"),
      spelling,
    );
  }
});

test("clicks per creator from the budget", () => {
  assert.equal(maxClicks(2_500_000, 5_000), 500);
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

test("every campaign status sits in one tab of the business's list", () => {
  assert.equal(campaignGroup("draft"), "drafts");
  assert.equal(campaignGroup("pending_review"), "drafts");
  assert.equal(campaignGroup("open"), "live");
  assert.equal(campaignGroup("paused"), "live");
  assert.equal(campaignGroup("in_progress"), "live");
  assert.equal(campaignGroup("closed"), "ended");
  assert.equal(campaignGroup("completed"), "ended");
  assert.equal(campaignGroup("cancelled"), "ended");
});

test("a campaign says how many places are filled and how many it still needs", () => {
  assert.deepEqual(placesStatus(3, 1), {
    left: 2,
    filled: "1 of 3 filled",
    needed: "2 still needed",
  });
  assert.deepEqual(placesStatus(3, 0), {
    left: 3,
    filled: "0 of 3 filled",
    needed: "3 still needed",
  });
  assert.equal(placesStatus(3, 3).needed, "All places filled");
  // More held than places (places can't be cut below held, but never go negative).
  assert.equal(placesStatus(2, 3).left, 0);
});

test("creators read how many places are left", () => {
  assert.equal(placesLeftText(3, 1), "2 of 3 places left");
  assert.equal(placesLeftText(3, 2), "1 of 3 places left");
  assert.equal(placesLeftText(3, 3), "All places filled");
  // Nothing taken, or the database didn't say: how many creators are wanted.
  assert.equal(placesLeftText(3, 0), "3 creators");
  assert.equal(placesLeftText(1, null), "1 creator");
});

test("a per-click campaign's clicks stop at midnight Lagos after the end date", () => {
  assert.equal(
    clickWindowEnded("2026-12-24", new Date("2026-12-24T22:59:59Z")),
    false,
  );
  assert.equal(
    clickWindowEnded("2026-12-24", new Date("2026-12-24T23:00:00Z")),
    true,
  );
});
