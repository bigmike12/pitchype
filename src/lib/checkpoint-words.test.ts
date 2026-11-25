import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkpointChip,
  dueText,
  metricsText,
  numberRows,
  outstandingRows,
  trailText,
} from "./checkpoint-words.ts";

const NOW = new Date("2026-12-10T10:00:00Z");

const row = (over: Partial<Parameters<typeof checkpointChip>[0]> = {}) => ({
  id: "r1",
  kind: "progress" as const,
  // The end of 12 Dec in Lagos.
  dueAt: "2026-12-12T23:00:00Z",
  status: "due" as const,
  skipReason: null,
  ...over,
});

test("a waiting checkpoint is Due, and Overdue once its time has passed", () => {
  assert.equal(checkpointChip(row(), NOW).label, "Due");
  assert.equal(
    checkpointChip(row({ dueAt: "2026-12-10T09:00:00Z" }), NOW).label,
    "Overdue",
  );
  // The daily job hasn't marked it yet, but the time has passed: it reads as overdue.
  assert.equal(
    checkpointChip(row({ status: "overdue" }), NOW).label,
    "Overdue",
  );
});

test("finished, late, skipped and closed checkpoints each say what happened", () => {
  assert.equal(checkpointChip(row({ status: "done" }), NOW).label, "Done");
  assert.equal(
    checkpointChip(row({ status: "done_late" }), NOW).label,
    "Done late",
  );
  const started = checkpointChip(
    row({ status: "skipped", skipReason: "started_after" }),
    NOW,
  );
  assert.equal(started.label, "Skipped");
  assert.match(started.detail ?? "", /started after this date/i);
  const soon = checkpointChip(
    row({ status: "skipped", skipReason: "too_soon" }),
    NOW,
  );
  assert.match(soon.detail ?? "", /3 days/);
  const closed = checkpointChip(row({ status: "closed" }), NOW);
  assert.equal(closed.label, "Closed");
  assert.match(closed.detail ?? "", /final work/i);
});

test("late work is never shown as a failure", () => {
  assert.notEqual(
    checkpointChip(row({ status: "done_late" }), NOW).tone,
    "danger",
  );
  assert.notEqual(
    checkpointChip(row({ status: "overdue" }), NOW).tone,
    "danger",
  );
});

test("rows are numbered: the kickoff by name, checkpoints in order, skipped ones included", () => {
  const rows = [
    row({ id: "k", kind: "kickoff", dueAt: "2026-12-09T09:00:00Z" }),
    row({ id: "a", status: "skipped", skipReason: "too_soon" }),
    row({ id: "b", dueAt: "2026-12-19T23:00:00Z" }),
  ];
  assert.deepEqual(
    numberRows(rows).map((r) => `${r.id}:${r.title}`),
    ["k:Kickoff", "a:Checkpoint 1", "b:Checkpoint 2"],
  );
});

test("outstanding rows are the ones waiting whose time has passed", () => {
  const rows = [
    row({
      id: "k",
      kind: "kickoff",
      status: "overdue",
      dueAt: "2026-12-09T09:00:00Z",
    }),
    row({ id: "future" }),
    row({ id: "passed", dueAt: "2026-12-10T09:00:00Z" }),
    row({ id: "done", status: "done", dueAt: "2026-12-01T09:00:00Z" }),
    row({
      id: "skipped",
      status: "skipped",
      skipReason: "too_soon",
      dueAt: "2026-12-01T09:00:00Z",
    }),
  ];
  assert.deepEqual(
    outstandingRows(rows, NOW).map((r) => r.id),
    ["k", "passed"],
  );
});

test("a checkpoint is due on a day, the kickoff at a time, both in Lagos", () => {
  assert.equal(dueText(row()), "12 Dec 2026");
  assert.match(
    dueText(row({ kind: "kickoff", dueAt: "2026-12-09T09:00:00Z" })),
    /9 Dec, 10:00/,
  );
});

test("figures read as one line per platform", () => {
  assert.equal(
    metricsText([
      { platform: "instagram", views: 1200, likes: 40, link_clicks: 9 },
      { platform: "tiktok", reach: 3000 },
    ]),
    "instagram: 1,200 views, 40 likes, 9 link clicks\ntiktok: 3,000 reach",
  );
});

test("the trail is written for people", () => {
  assert.equal(
    trailText("applied", {}, "Checkpoint 1"),
    "Checkpoint 1 applies to this job.",
  );
  assert.match(
    trailText("skipped", { reason: "started_after" }, "Checkpoint 1"),
    /started after/,
  );
  assert.match(trailText("warned", {}, "Kickoff"), /warned/i);
  assert.match(trailText("closed", {}, "Checkpoint 2"), /final work/);
  assert.match(
    trailText("evidence_late", {}, "Checkpoint 2"),
    /after it was due/,
  );
});
