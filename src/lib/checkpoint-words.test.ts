import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkpointChip,
  dueText,
  metricsText,
  numberRows,
  checkpointProgress,
  dueWhen,
  nextRowId,
  outstandingRows,
  trailEntries,
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

test("a waiting checkpoint is Upcoming until it's next or close, and Overdue once its time has passed", () => {
  // Due the end of 12 Dec, two days away: not next, so just upcoming.
  assert.equal(checkpointChip(row(), NOW).label, "Upcoming");
  assert.equal(checkpointChip(row(), NOW).tone, "muted");
  // The first one still waiting is the one to work on.
  assert.equal(checkpointChip(row(), NOW, true).label, "Up next");
  // Within a day of its due time, it says so, next or not.
  assert.equal(
    checkpointChip(row({ dueAt: "2026-12-10T23:00:00Z" }), NOW).label,
    "Due soon",
  );
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

test("a checkpoint far in the future is never called due", () => {
  const far = row({ dueAt: "2026-12-30T23:00:00Z" });
  assert.doesNotMatch(checkpointChip(far, NOW).label, /due/i);
  assert.doesNotMatch(checkpointChip(far, NOW, true).label, /due/i);
});

test("the due date also says how far away it is, in Lagos days", () => {
  // NOW is 11:00 on 10 Dec in Lagos.
  assert.equal(dueWhen(row({ dueAt: "2026-12-10T22:59:59Z" }), NOW), "today");
  assert.equal(
    dueWhen(row({ dueAt: "2026-12-11T23:00:00Z" }), NOW),
    "tomorrow",
  );
  assert.equal(dueWhen(row(), NOW), "in 2 days");
  assert.equal(
    dueWhen(row({ dueAt: "2026-12-09T23:00:00Z" }), NOW),
    "yesterday",
  );
  assert.equal(
    dueWhen(row({ dueAt: "2026-12-06T23:00:00Z" }), NOW),
    "4 days ago",
  );
  assert.equal(
    dueWhen(row({ kind: "kickoff", dueAt: "2026-12-11T09:00:00Z" }), NOW),
    "tomorrow",
  );
});

test("the next row is the first one still waiting", () => {
  const rows = [
    row({ id: "k", kind: "kickoff", status: "done" }),
    row({ id: "s", status: "skipped", skipReason: "too_soon" }),
    row({ id: "a" }),
    row({ id: "b" }),
  ];
  assert.equal(nextRowId(rows), "a");
  assert.equal(nextRowId([row({ id: "x", status: "closed" })]), null);
});

test("progress counts finished rows out of the ones that apply", () => {
  const rows = [
    row({ id: "k", kind: "kickoff", status: "done" }),
    row({ id: "l", status: "done_late" }),
    row({ id: "s", status: "skipped", skipReason: "too_soon" }),
    row({ id: "o", status: "overdue" }),
    row({ id: "u" }),
  ];
  assert.deepEqual(checkpointProgress(rows), { done: 2, total: 4 });
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

test("the trail folds the start-of-work rows into one line", () => {
  const rows = [
    row({ id: "k", kind: "kickoff" }),
    row({ id: "a" }),
    row({ id: "b", status: "skipped", skipReason: "too_soon" }),
    row({ id: "c" }),
  ];
  const at = "2026-11-26T21:56:00Z";
  const event = (id: string, name: string, cp: string, createdAt = at) => ({
    id,
    hireCheckpointId: cp,
    event: name,
    detail: {},
    createdAt,
  });
  const entries = trailEntries(
    [
      event("1", "applied", "k"),
      event("2", "applied", "a"),
      event("3", "skipped", "b"),
      event("4", "applied", "c"),
      event("5", "kickoff_submitted", "k", "2026-11-27T08:00:00Z"),
    ],
    rows,
  );
  assert.deepEqual(
    entries.map((e) => e.text),
    [
      "Work started: the kickoff and 2 checkpoints apply to this job.",
      "Checkpoint 2 was skipped: it fell less than 3 days after the job started.",
      "Kickoff confirmed.",
    ],
  );
  assert.equal(entries[0].createdAt, at);
  assert.equal(entries[2].tone, "success");
});

test("a single applied row reads on its own", () => {
  const rows = [row({ id: "a" })];
  const entries = trailEntries(
    [
      {
        id: "1",
        hireCheckpointId: "a",
        event: "applied",
        detail: {},
        createdAt: "2026-11-26T21:56:00Z",
      },
    ],
    rows,
  );
  assert.deepEqual(
    entries.map((e) => e.text),
    ["Work started: 1 checkpoint applies to this job."],
  );
});
