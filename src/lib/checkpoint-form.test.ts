import assert from "node:assert/strict";
import { test } from "node:test";

import {
  metricFieldName,
  parseMetricsForm,
  parseOptionalDay,
} from "./checkpoint-form.ts";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

test("figures typed per platform become one entry per platform", () => {
  const parsed = parseMetricsForm(
    form([
      [metricFieldName("instagram", "views"), "1,200"],
      [metricFieldName("instagram", "likes"), "40"],
      [metricFieldName("instagram", "reach"), ""],
      [metricFieldName("tiktok", "link_clicks"), "9"],
    ]),
  );
  assert.deepEqual(parsed, {
    ok: true,
    metrics: [
      { platform: "instagram", views: 1200, likes: 40 },
      { platform: "tiktok", link_clicks: 9 },
    ],
  });
});

test("no figures typed is not an error, just nothing", () => {
  assert.deepEqual(parseMetricsForm(form([])), { ok: true, metrics: null });
  assert.deepEqual(
    parseMetricsForm(form([[metricFieldName("x", "views"), " "]])),
    { ok: true, metrics: null },
  );
});

test("figures must be whole numbers", () => {
  for (const bad of ["-4", "1.5", "abc", "12k", "1".repeat(16)]) {
    const parsed = parseMetricsForm(
      form([[metricFieldName("instagram", "views"), bad]]),
    );
    assert.equal(parsed.ok, false, bad);
  }
});

test("a day field is empty, a real date, or an error", () => {
  assert.deepEqual(parseOptionalDay(""), { ok: true, day: null });
  assert.deepEqual(parseOptionalDay("2026-12-10"), {
    ok: true,
    day: "2026-12-10",
  });
  assert.equal(parseOptionalDay("2026-02-30").ok, false);
  assert.equal(parseOptionalDay("10/12/2026").ok, false);
});
