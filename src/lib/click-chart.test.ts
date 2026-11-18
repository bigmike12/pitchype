import assert from "node:assert/strict";
import { test } from "node:test";

import { barHeights, fillDays, sourceRows } from "./click-chart.ts";

test("every day in the range is there, with gaps as zero", () => {
  const days = fillDays(
    [
      { day: "2026-12-01", billable: 3, hits: 4 },
      { day: "2026-12-04", billable: 1, hits: 1 },
    ],
    "2026-12-01",
    "2026-12-05",
  );
  assert.deepEqual(
    days.map((d) => `${d.day}:${d.billable}/${d.hits}`),
    [
      "2026-12-01:3/4",
      "2026-12-02:0/0",
      "2026-12-03:0/0",
      "2026-12-04:1/1",
      "2026-12-05:0/0",
    ],
  );
});

test("the range crosses a month end", () => {
  assert.deepEqual(
    fillDays([], "2026-11-30", "2026-12-01").map((d) => d.day),
    ["2026-11-30", "2026-12-01"],
  );
});

test("a long range keeps the latest 120 days", () => {
  const days = fillDays([], "2026-01-01", "2026-07-19");
  assert.equal(days.length, 120);
  assert.equal(days.at(-1)?.day, "2026-07-19");
});

test("bars scale to the tallest, and a small count still shows", () => {
  assert.deepEqual(barHeights([0, 5, 10], 80), [0, 40, 80]);
  assert.ok(barHeights([0, 1, 1000], 80)[1] >= 2);
  assert.deepEqual(barHeights([0, 0], 80), [0, 0]);
});

test("sources are named, ordered and shared out", () => {
  assert.deepEqual(sourceRows({ whatsapp: 3, unknown: 1 }), [
    { source: "whatsapp", label: "WhatsApp", count: 3, share: 75 },
    { source: "unknown", label: "Unknown or direct", count: 1, share: 25 },
  ]);
  assert.deepEqual(sourceRows({}), []);
  assert.equal(sourceRows({ other_site: 1 })[0].label, "Other websites");
});
