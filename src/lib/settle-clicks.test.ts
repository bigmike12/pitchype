import assert from "node:assert/strict";
import { test } from "node:test";

import { runSettleClicks } from "./settle-clicks.ts";

function logger() {
  const lines: string[] = [];
  return { lines, log: (line: string) => void lines.push(line) };
}

test("a clean run reports its counts", async () => {
  const { lines, log } = logger();
  const result = await runSettleClicks({
    settle: async () => ({ notified: 4, settled: 2, failed: 0 }),
    log,
  });
  assert.deepEqual(result, { ok: true, notified: 4, settled: 2, failed: 0 });
  assert.equal(lines.length, 0);
});

test("a hire that couldn't settle fails the run and is logged", async () => {
  const { lines, log } = logger();
  const result = await runSettleClicks({
    settle: async () => ({ notified: 0, settled: 3, failed: 1 }),
    log,
  });
  assert.deepEqual(result, { ok: false, notified: 0, settled: 3, failed: 1 });
  assert.equal(lines.length, 1);
});

test("a database error fails the run and logs only the error class", async () => {
  const { lines, log } = logger();
  const result = await runSettleClicks({
    settle: async () => {
      throw new TypeError("connection to 10.0.0.1 refused with secret abc");
    },
    log,
  });
  assert.deepEqual(result, { ok: false, notified: 0, settled: 0, failed: 0 });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("TypeError"));
  assert.ok(!lines[0].includes("secret"));
});
