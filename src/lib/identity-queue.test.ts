import assert from "node:assert/strict";
import { test } from "node:test";

import { screeningQueues, type ScreeningRow } from "./identity-queue.ts";

const row = (
  id: string,
  userId: string,
  status: ScreeningRow["status"],
  createdAt: string,
  reviewOutcome: ScreeningRow["reviewOutcome"] = null,
): ScreeningRow => ({
  id,
  userId,
  subject: "person",
  trigger: "first_payout",
  status,
  matchCount: 1,
  reviewOutcome,
  createdAt,
});

const states = (map: Record<string, string>) => (userId: string) =>
  (map[userId] ?? "none") as Parameters<typeof screeningQueues>[1] extends (
    u: string,
  ) => infer S
    ? S
    : never;

test("a possible match or an error that is still the latest state needs attention", () => {
  const { attention, confirmed } = screeningQueues(
    [
      row("s1", "a", "possible_match", "2026-11-23T10:00:00Z"),
      row("s2", "b", "error", "2026-11-23T11:00:00Z"),
    ],
    states({ a: "possible_match", b: "error" }),
  );
  assert.deepEqual(
    attention.map((r) => r.id),
    ["s2", "s1"],
  );
  assert.equal(confirmed.length, 0);
});

test("only the newest row per person counts", () => {
  const { attention } = screeningQueues(
    [
      row("old", "a", "possible_match", "2026-11-20T10:00:00Z"),
      row("new", "a", "possible_match", "2026-11-23T10:00:00Z"),
    ],
    states({ a: "possible_match" }),
  );
  assert.deepEqual(
    attention.map((r) => r.id),
    ["new"],
  );
});

test("someone since cleared, or screened clear afterwards, is not listed", () => {
  const { attention, confirmed } = screeningQueues(
    [
      row("s1", "a", "possible_match", "2026-11-20T10:00:00Z", "cleared"),
      row("s2", "b", "possible_match", "2026-11-20T10:00:00Z"),
    ],
    states({ a: "clear", b: "clear" }),
  );
  assert.equal(attention.length, 0);
  assert.equal(confirmed.length, 0);
});

test("a confirmed match is listed apart, with its row", () => {
  const { attention, confirmed } = screeningQueues(
    [row("s1", "a", "possible_match", "2026-11-20T10:00:00Z", "confirmed")],
    states({ a: "confirmed" }),
  );
  assert.equal(attention.length, 0);
  assert.deepEqual(
    confirmed.map((r) => r.id),
    ["s1"],
  );
});
