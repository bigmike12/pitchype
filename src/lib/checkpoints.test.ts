import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkpointApplies,
  checkpointDates,
  evidenceProblems,
  finalRequirementProblems,
  isValidInterval,
  kickoffDueAt,
  lagosDate,
  parseMetrics,
  timelineView,
} from "./checkpoints.ts";

// Schedule -----------------------------------------------------------------------

test("a 7-day interval gives a checkpoint every week before final delivery", () => {
  assert.deepEqual(
    checkpointDates({
      postFrom: "2026-12-01",
      deliverBy: "2026-12-20",
      intervalDays: 7,
    }),
    ["2026-12-08", "2026-12-15"],
  );
});

test("an interval that fits no checkpoint gives none", () => {
  assert.deepEqual(
    checkpointDates({
      postFrom: "2026-12-01",
      deliverBy: "2026-12-05",
      intervalDays: 7,
    }),
    [],
  );
});

test("a checkpoint on the final delivery date itself is left out", () => {
  assert.deepEqual(
    checkpointDates({
      postFrom: "2026-12-01",
      deliverBy: "2026-12-15",
      intervalDays: 7,
    }),
    ["2026-12-08"],
  );
});

test("the schedule crosses a month end", () => {
  assert.deepEqual(
    checkpointDates({
      postFrom: "2026-12-25",
      deliverBy: "2027-01-20",
      intervalDays: 14,
    }),
    ["2027-01-08"],
  );
});

test("the interval is a whole number of days from 2 to 30", () => {
  for (const ok of [2, 3, 7, 14, 30]) assert.equal(isValidInterval(ok), true);
  for (const bad of [0, 1, 31, 2.5, Number.NaN, -7]) {
    assert.equal(isValidInterval(bad), false);
  }
});

// Applicability ------------------------------------------------------------------

test("a checkpoint three or more days after the start applies", () => {
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-05T09:00:00+01:00")),
    "applies",
  );
});

test("a checkpoint two days after the start is too soon", () => {
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-06T09:00:00+01:00")),
    "too_soon",
  );
});

test("a checkpoint on the start day is too soon, one already past is started_after", () => {
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-08T09:00:00+01:00")),
    "too_soon",
  );
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-09T09:00:00+01:00")),
    "started_after",
  );
});

test("the start day is the Lagos day, not the UTC day", () => {
  // 23:30 in Lagos on 4 Dec is 22:30 UTC the same day; 00:30 on 5 Dec is 23:30 UTC on 4 Dec.
  assert.equal(lagosDate(new Date("2026-12-04T23:30:00+01:00")), "2026-12-04");
  assert.equal(lagosDate(new Date("2026-12-05T00:30:00+01:00")), "2026-12-05");
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-04T23:30:00+01:00")),
    "applies",
  );
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-05T00:30:00+01:00")),
    "applies",
  );
  assert.equal(
    checkpointApplies("2026-12-08", new Date("2026-12-06T00:30:00+01:00")),
    "too_soon",
  );
});

test("the kickoff is due 48 hours after the start", () => {
  assert.equal(
    kickoffDueAt(new Date("2026-12-05T09:00:00Z")).toISOString(),
    "2026-12-07T09:00:00.000Z",
  );
});

// Timeline -----------------------------------------------------------------------

const timeline = {
  start: "2026-12-01",
  liveFrom: "2026-11-20",
  deliverBy: "2026-12-21",
  endsOn: "2026-12-31",
  checkpoints: ["2026-12-08", "2026-12-15"],
};

test("the bar runs from the start to the end with today and markers in place", () => {
  const view = timelineView({ ...timeline, today: "2026-12-16" });
  assert.equal(view.from, "2026-12-01");
  assert.equal(view.to, "2026-12-31");
  assert.equal(view.todayPercent, 50);
  assert.deepEqual(view.markers, [
    { kind: "checkpoint", date: "2026-12-08", percent: 23 },
    { kind: "checkpoint", date: "2026-12-15", percent: 47 },
    { kind: "cutoff", date: "2026-12-21", percent: 67 },
  ]);
});

test("today is clamped to the ends of the bar", () => {
  assert.equal(
    timelineView({ ...timeline, today: "2026-11-01" }).todayPercent,
    0,
  );
  assert.equal(
    timelineView({ ...timeline, today: "2027-02-01" }).todayPercent,
    100,
  );
});

test("a campaign without a start or end uses the go-live date and final delivery", () => {
  const view = timelineView({
    ...timeline,
    start: null,
    endsOn: null,
    checkpoints: [],
    today: "2026-12-01",
  });
  assert.equal(view.from, "2026-11-20");
  assert.equal(view.to, "2026-12-21");
  assert.deepEqual(view.markers, [
    { kind: "cutoff", date: "2026-12-21", percent: 100 },
  ]);
});

// Metrics ------------------------------------------------------------------------

test("metrics with whole, non-negative numbers are accepted", () => {
  const result = parseMetrics([
    { platform: "instagram", views: 1200, likes: 40 },
  ]);
  assert.deepEqual(result, {
    ok: true,
    metrics: [{ platform: "instagram", views: 1200, likes: 40 }],
  });
});

test("metrics reject negatives, fractions, text, unknown keys and too many platforms", () => {
  const bad: unknown[] = [
    [{ platform: "instagram", views: -1 }],
    [{ platform: "instagram", views: 1.5 }],
    [{ platform: "instagram", views: "12" }],
    [{ platform: "instagram", followers: 12 }],
    [{ platform: "instagram" }],
    [{ views: 12 }],
    [],
    "views",
    null,
    Array.from({ length: 7 }, (_, i) => ({ platform: `p${i}`, views: 1 })),
    [{ platform: "instagram", views: Number.MAX_SAFE_INTEGER + 2 }],
  ];
  for (const value of bad)
    assert.equal(parseMetrics(value).ok, false, JSON.stringify(value));
});

// Evidence -----------------------------------------------------------------------

const none = {
  note: null,
  links: [],
  fileCount: 0,
  metrics: null,
  capturedOn: null,
};
const metrics = [{ platform: "instagram", views: 10 }];

test("a progress update needs a note of 20 to 1,000 characters", () => {
  assert.equal(evidenceProblems(["progress_update"], none).length, 1);
  assert.equal(
    evidenceProblems(["progress_update"], { ...none, note: "too short" })
      .length,
    1,
  );
  assert.equal(
    evidenceProblems(["progress_update"], { ...none, note: "x".repeat(1001) })
      .length,
    1,
  );
  assert.deepEqual(
    evidenceProblems(["progress_update"], {
      ...none,
      note: "Filmed two of the three reels.",
    }),
    [],
  );
});

test("content links need one to ten https links", () => {
  assert.equal(evidenceProblems(["content_links"], none).length, 1);
  assert.equal(
    evidenceProblems(["content_links"], {
      ...none,
      links: ["http://example.com/a"],
    }).length,
    1,
  );
  assert.equal(
    evidenceProblems(["content_links"], {
      ...none,
      links: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`),
    }).length,
    1,
  );
  assert.deepEqual(
    evidenceProblems(["content_links"], {
      ...none,
      links: ["https://example.com/a"],
    }),
    [],
  );
});

test("publication screenshots need one to five files", () => {
  assert.equal(evidenceProblems(["publication_screenshots"], none).length, 1);
  assert.equal(
    evidenceProblems(["publication_screenshots"], { ...none, fileCount: 6 })
      .length,
    1,
  );
  assert.deepEqual(
    evidenceProblems(["publication_screenshots"], { ...none, fileCount: 2 }),
    [],
  );
});

test("analytics need a screenshot, metrics and the day they were captured", () => {
  assert.equal(evidenceProblems(["analytics"], none).length, 3);
  assert.deepEqual(
    evidenceProblems(["analytics"], {
      ...none,
      fileCount: 1,
      metrics,
      capturedOn: "2026-12-10",
    }),
    [],
  );
});

test("nothing required means nothing missing", () => {
  assert.deepEqual(evidenceProblems([], none), []);
});

// Final requirements -------------------------------------------------------------

const finalNone = {
  links: [],
  fileCount: 0,
  metrics: null,
  capturedOn: null,
  report: null,
  postFrom: "2026-12-01",
  today: "2026-12-20",
};

test("no final requirements means nothing extra is asked", () => {
  assert.deepEqual(finalRequirementProblems([], finalNone), []);
});

test("a final report needs 100 to 1,000 characters", () => {
  assert.equal(finalRequirementProblems(["final_report"], finalNone).length, 1);
  assert.equal(
    finalRequirementProblems(["final_report"], {
      ...finalNone,
      report: "short",
    }).length,
    1,
  );
  assert.deepEqual(
    finalRequirementProblems(["final_report"], {
      ...finalNone,
      report: "x".repeat(100),
    }),
    [],
  );
  assert.equal(
    finalRequirementProblems(["final_report"], {
      ...finalNone,
      report: "x".repeat(1001),
    }).length,
    1,
  );
});

test("final content links and screenshots are each required when asked for", () => {
  assert.equal(
    finalRequirementProblems(["content_links"], finalNone).length,
    1,
  );
  assert.deepEqual(
    finalRequirementProblems(["content_links"], {
      ...finalNone,
      links: ["https://example.com/a"],
    }),
    [],
  );
  assert.equal(
    finalRequirementProblems(["publication_screenshots"], finalNone).length,
    1,
  );
  assert.deepEqual(
    finalRequirementProblems(["publication_screenshots"], {
      ...finalNone,
      fileCount: 1,
    }),
    [],
  );
});

test("final analytics need a screenshot, metrics and a capture date in range", () => {
  const ok = { ...finalNone, fileCount: 1, metrics, capturedOn: "2026-12-18" };
  assert.deepEqual(finalRequirementProblems(["analytics"], ok), []);
  assert.equal(finalRequirementProblems(["analytics"], finalNone).length, 3);
  assert.equal(
    finalRequirementProblems(["analytics"], { ...ok, capturedOn: "2026-11-30" })
      .length,
    1,
  );
  assert.equal(
    finalRequirementProblems(["analytics"], { ...ok, capturedOn: "2026-12-21" })
      .length,
    1,
  );
});
