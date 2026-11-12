import assert from "node:assert/strict";
import { test } from "node:test";

import { flagMessage, standingView } from "./moderation.ts";

const now = new Date("2026-11-10T12:00:00Z");

test("standing reads clear, warned, paused or suspended", () => {
  assert.deepEqual(
    standingView(
      { activeStrikes: 0, restrictedUntil: null, suspendedAt: null },
      now,
    ),
    { state: "clear", until: null },
  );
  assert.deepEqual(
    standingView(
      { activeStrikes: 1, restrictedUntil: null, suspendedAt: null },
      now,
    ),
    { state: "warned", until: null },
  );
  assert.deepEqual(
    standingView(
      {
        activeStrikes: 2,
        restrictedUntil: "2026-11-13T12:00:00Z",
        suspendedAt: null,
      },
      now,
    ),
    { state: "paused", until: "2026-11-13T12:00:00Z" },
  );
  assert.deepEqual(
    standingView(
      {
        activeStrikes: 3,
        restrictedUntil: "2026-11-13T12:00:00Z",
        suspendedAt: "2026-11-10T11:00:00Z",
      },
      now,
    ),
    { state: "suspended", until: null },
  );
});

test("a pause that has ended reads as a warning", () => {
  assert.deepEqual(
    standingView(
      {
        activeStrikes: 2,
        restrictedUntil: "2026-11-09T12:00:00Z",
        suspendedAt: null,
      },
      now,
    ),
    { state: "warned", until: null },
  );
});

test("the strike message says what was found and what happens next", () => {
  assert.match(flagMessage("phone number", 1), /looks like a phone number/);
  assert.match(flagMessage("email address", 1), /looks like an email address/);
  assert.match(flagMessage("phone number", 1), /warning/);
  assert.match(flagMessage("WhatsApp link", 2), /paused for 3 days/);
  assert.match(flagMessage("Telegram link", 3), /suspended/);
});
