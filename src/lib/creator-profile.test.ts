import assert from "node:assert/strict";
import { test } from "node:test";

import {
  directoryQuery,
  followersSourceText,
  followersText,
  normalizeHandle,
  parseAboutForm,
  parseDirectoryFilters,
  parsePlatformForm,
  parseRate,
  publishProblems,
  startingRateText,
  verificationView,
  type PlatformListing,
  type VerificationRequest,
} from "./creator-profile.ts";

const NICHES = ["food-and-drinks", "fashion", "lifestyle", "travel"];

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

test("handles: @, case and pasted links", () => {
  assert.deepEqual(normalizeHandle("instagram", " @Bayo.Cooks "), {
    ok: true,
    handle: "bayo.cooks",
  });
  assert.deepEqual(
    normalizeHandle("instagram", "https://www.instagram.com/bayo.cooks/?hl=en"),
    { ok: true, handle: "bayo.cooks" },
  );
  assert.deepEqual(normalizeHandle("tiktok", "tiktok.com/@ChidiStyles"), {
    ok: true,
    handle: "chidistyles",
  });
  assert.deepEqual(normalizeHandle("x", "https://twitter.com/Ada_O"), {
    ok: true,
    handle: "ada_o",
  });
  assert.deepEqual(
    normalizeHandle("youtube", "https://youtube.com/@BayoCooks"),
    {
      ok: true,
      handle: "bayocooks",
    },
  );
});

test("handles: each platform's rules", () => {
  assert.equal(normalizeHandle("x", "has.dot").ok, false);
  assert.equal(normalizeHandle("x", "a".repeat(16)).ok, false);
  assert.equal(normalizeHandle("tiktok", "a").ok, false);
  assert.equal(normalizeHandle("instagram", "two words").ok, false);
  assert.equal(normalizeHandle("instagram", "").ok, false);
});

test("handles: a link from the wrong site or a channel link is refused", () => {
  const wrongSite = normalizeHandle("instagram", "https://tiktok.com/@bayo");
  assert.equal(wrongSite.ok, false);
  assert.match(!wrongSite.ok ? wrongSite.error : "", /another site/);

  const channel = normalizeHandle(
    "youtube",
    "https://www.youtube.com/channel/UC1234567890",
  );
  assert.equal(channel.ok, false);
});

test("rates: naira in, kobo out; blank is negotiable", () => {
  assert.deepEqual(parseRate("50,000"), { ok: true, kobo: 5_000_000 });
  assert.deepEqual(parseRate("₦ 75000"), { ok: true, kobo: 7_500_000 });
  assert.deepEqual(parseRate("NGN1000"), { ok: true, kobo: 100_000 });
  assert.deepEqual(parseRate("  "), { ok: true, kobo: null });
  assert.equal(parseRate("999").ok, false);
  assert.equal(parseRate("50000.50").ok, false);
  assert.equal(parseRate("-5000").ok, false);
  assert.equal(parseRate("100000001").ok, false);
  assert.equal(parseRate("fifty").ok, false);
});

test("rates: how they're shown", () => {
  assert.equal(startingRateText(5_000_000), "From ₦50,000");
  assert.equal(startingRateText(null), "Rate negotiable");
});

test("about form: a complete form", () => {
  const parsed = parseAboutForm(
    form([
      ["displayName", "  Bayo   Cooks "],
      ["bio", "  Budget recipes.\nEvery week.  "],
      ["niches", "food-and-drinks"],
      ["niches", "lifestyle"],
      ["state", "Oyo"],
      ["city", "Ibadan"],
      ["startingRate", "50,000"],
    ]),
    NICHES,
  );
  assert.deepEqual(parsed, {
    ok: true,
    value: {
      displayName: "Bayo Cooks",
      bio: "Budget recipes.\nEvery week.",
      niches: ["food-and-drinks", "lifestyle"],
      state: "Oyo",
      city: "Ibadan",
      startingRateKobo: 5_000_000,
    },
  });
});

test("about form: niches are 1 to 3 from the list; repeats count once", () => {
  const base: [string, string][] = [
    ["displayName", "Bayo"],
    ["state", "Oyo"],
    ["city", "Ibadan"],
  ];
  const none = parseAboutForm(form([...base, ["niches", "astrology"]]), NICHES);
  assert.equal(none.ok, false);
  assert.equal(!none.ok && none.errors.niches, "Choose at least one niche.");

  const four = parseAboutForm(
    form([...base, ...NICHES.map((n): [string, string] => ["niches", n])]),
    NICHES,
  );
  assert.equal(!four.ok && four.errors.niches, "Choose up to 3 niches.");

  const repeated = parseAboutForm(
    form([...base, ["niches", "fashion"], ["niches", "fashion"]]),
    NICHES,
  );
  assert.equal(repeated.ok && repeated.value.niches.length, 1);
});

test("about form: blank bio and rate are fine; a long bio is not", () => {
  const ok = parseAboutForm(
    form([
      ["displayName", "Bayo"],
      ["state", "Oyo"],
      ["city", "Ibadan"],
      ["niches", "fashion"],
      ["bio", "   "],
      ["startingRate", ""],
    ]),
    NICHES,
  );
  assert.equal(ok.ok && ok.value.bio, null);
  assert.equal(ok.ok && ok.value.startingRateKobo, null);

  const long = parseAboutForm(
    form([
      ["displayName", "Bayo"],
      ["state", "Oyo"],
      ["city", "Ibadan"],
      ["niches", "fashion"],
      ["bio", "x".repeat(301)],
    ]),
    NICHES,
  );
  assert.equal(long.ok, false);
  assert.match(!long.ok ? (long.errors.bio ?? "") : "", /300 characters/);
});

test("platform form", () => {
  assert.deepEqual(
    parsePlatformForm(
      form([
        ["platform", "instagram"],
        ["handle", "@Bayo.Cooks"],
        ["followerRange", "10k_50k"],
      ]),
    ),
    {
      ok: true,
      value: {
        platform: "instagram",
        handle: "bayo.cooks",
        followerRange: "10k_50k",
      },
    },
  );
  assert.equal(parsePlatformForm(form([["platform", "myspace"]])), null);

  const bad = parsePlatformForm(
    form([
      ["platform", "x"],
      ["handle", "no.dots.on.x"],
      ["followerRange", "a_million"],
    ]),
  );
  assert.equal(bad?.ok, false);
  assert.ok(bad && !bad.ok && bad.errors.handle && bad.errors.followerRange);
});

test("publishing needs a niche and a platform", () => {
  assert.deepEqual(publishProblems({ niches: [], platformCount: 0 }), [
    "Choose at least one niche.",
    "Add at least one platform.",
  ]);
  assert.deepEqual(
    publishProblems({ niches: ["fashion"], platformCount: 1 }),
    [],
  );
});

test("directory filters: known values kept, the rest ignored", () => {
  const filters = parseDirectoryFilters(
    {
      niche: "fashion",
      platform: "tiktok",
      followers: "10k_50k",
      state: "Lagos",
      maxRate: "50000",
      page: "2",
    },
    NICHES,
    { canFilterByRate: true },
  );
  assert.deepEqual(filters, {
    niche: "fashion",
    platform: "tiktok",
    minFollowers: "10k_50k",
    state: "Lagos",
    maxRateNaira: 50_000,
    page: 2,
  });
  assert.equal(
    directoryQuery(filters),
    "?niche=fashion&platform=tiktok&followers=10k_50k&state=Lagos&maxRate=50000&page=2",
  );

  const junk = parseDirectoryFilters(
    { niche: "astrology", platform: "myspace", state: "Atlantis", page: "-3" },
    NICHES,
    { canFilterByRate: true },
  );
  assert.deepEqual(junk, {
    niche: undefined,
    platform: undefined,
    minFollowers: undefined,
    state: undefined,
    maxRateNaira: undefined,
    page: 1,
  });
  assert.equal(directoryQuery(junk), "");
});

test("directory filters: only businesses can filter by rate", () => {
  const filters = parseDirectoryFilters({ maxRate: "50000" }, NICHES, {
    canFilterByRate: false,
  });
  assert.equal(filters.maxRateNaira, undefined);
  // Only the listed options, so the filter can't be used to probe exact rates.
  const odd = parseDirectoryFilters({ maxRate: "51234" }, NICHES, {
    canFilterByRate: true,
  });
  assert.equal(odd.maxRateNaira, undefined);
});

test("followers: verified counts beat self-reported ranges", () => {
  const selfReported: PlatformListing = {
    platform: "instagram",
    handle: null,
    followerRange: "10k_50k",
    followersUpdatedAt: "2026-11-03T10:00:00Z",
    verified: false,
    verifiedFollowerCount: null,
    verifiedAt: null,
  };
  assert.equal(followersText(selfReported), "10K–50K followers");
  assert.equal(
    followersSourceText(selfReported),
    "Self-reported, updated 3 Nov 2026",
  );

  const verified: PlatformListing = {
    ...selfReported,
    verified: true,
    verifiedFollowerCount: 12_400,
    verifiedAt: "2026-11-05T23:30:00Z",
  };
  assert.equal(followersText(verified), "12,400 followers");
  // 23:30 UTC is already the 6th in Lagos.
  assert.equal(followersSourceText(verified), "Verified, as of 6 Nov 2026");
});

test("verification: which step a creator sees", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const request = (
    overrides: Partial<VerificationRequest>,
  ): VerificationRequest => ({
    id: "r1",
    platform: "instagram",
    handle: "bayocooks",
    code: "pitchype-7K3F9Q",
    status: "pending",
    submittedAt: null,
    expiresAt: "2026-11-10T12:00:00Z",
    createdAt: "2026-11-08T12:00:00Z",
    reviewedAt: null,
    followerCountSeen: null,
    ...overrides,
  });
  const view = (requests: VerificationRequest[]) =>
    verificationView(requests, "instagram", "bayocooks", now);

  assert.deepEqual(view([]), { verified: null, step: { kind: "none" } });
  assert.equal(view([request({})]).step.kind, "awaiting_code");
  assert.equal(
    view([request({ expiresAt: "2026-11-09T11:00:00Z" })]).step.kind,
    "none",
    "an unsubmitted code that ran out",
  );
  assert.equal(
    view([request({ submittedAt: "2026-11-09T09:00:00Z" })]).step.kind,
    "in_review",
  );
  assert.equal(view([request({ status: "rejected" })]).step.kind, "rejected");

  const badge = request({
    id: "r0",
    status: "verified",
    createdAt: "2026-08-01T12:00:00Z",
    reviewedAt: "2026-08-02T12:00:00Z",
    followerCountSeen: 12_400,
  });
  const reverifying = view([badge, request({})]);
  assert.deepEqual(reverifying.verified, {
    followerCount: 12_400,
    verifiedAt: "2026-08-02T12:00:00Z",
  });
  assert.equal(
    reverifying.step.kind,
    "awaiting_code",
    "re-verifying keeps the badge",
  );

  assert.equal(
    view([badge]).step.kind,
    "none",
    "verified, nothing in progress",
  );
  assert.equal(view([request({ status: "revoked" })]).step.kind, "revoked");

  const otherHandle = verificationView([badge], "instagram", "newname", now);
  assert.equal(otherHandle.verified, null, "a badge belongs to its handle");
});
