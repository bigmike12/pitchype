import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldRefreshBell } from "./bell-refresh.ts";

const T1 = "2026-11-18T10:00:00.123456+00:00";
const T2 = "2026-11-18T10:05:00.000000+00:00";

test("a new row refreshes and is remembered", () => {
  const seen = new Map<string, number>();
  assert.equal(
    shouldRefreshBell(seen, {
      eventType: "INSERT",
      row: { id: "a", read_at: null, occurred_at: T1 },
    }),
    true,
  );
  assert.equal(seen.get("a"), Date.parse(T1));
});

test("the email queue claiming or finishing an unread row does not refresh", () => {
  const seen = new Map([["a", Date.parse(T1)]]);
  // Realtime may spell the same instant differently from Postgres.
  const row = { id: "a", read_at: null, occurred_at: "2026-11-18T10:00:00.123Z" };
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row }), false);
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row }), false);
});

test("a bumped unread chat thread refreshes once, then its own claim does not", () => {
  const seen = new Map([["a", Date.parse(T1)]]);
  const bumped = { id: "a", read_at: null, occurred_at: T2 };
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row: bumped }), true);
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row: bumped }), false);
});

test("a thread read and then bumped again refreshes on the bump", () => {
  const seen = new Map([["a", Date.parse(T1)]]);
  const read = { id: "a", read_at: T2, occurred_at: T1 };
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row: read }), false);
  const bumped = { id: "a", read_at: null, occurred_at: T2 };
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row: bumped }), true);
});

test("marking a row read does not refresh", () => {
  const seen = new Map([["a", Date.parse(T1)]]);
  assert.equal(
    shouldRefreshBell(seen, {
      eventType: "UPDATE",
      row: { id: "a", read_at: T2, occurred_at: T1 },
    }),
    false,
  );
});

test("an unknown unread row updated refreshes once", () => {
  const seen = new Map<string, number>();
  const row = { id: "z", read_at: null, occurred_at: T1 };
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row }), true);
  assert.equal(shouldRefreshBell(seen, { eventType: "UPDATE", row }), false);
});

test("a delete never refreshes", () => {
  assert.equal(
    shouldRefreshBell(new Map(), { eventType: "DELETE", row: {} }),
    false,
  );
});
