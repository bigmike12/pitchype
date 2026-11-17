import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  cronStatus,
  runReviewDeadlines,
  type ReviewDeadlineDeps,
} from "./review-deadlines.ts";

const realConsoleError = console.error;
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.error = realConsoleError;
});

type Script = {
  released?: number | Error;
  reminded?: number | Error;
  orphans?: string[] | Error;
};

function fakes(script: Script = {}) {
  const calls: string[] = [];
  const step =
    <T>(name: string, value: T | Error) =>
    async (): Promise<T> => {
      calls.push(name);
      await Promise.resolve();
      if (value instanceof Error) throw value;
      return value;
    };
  const deps: ReviewDeadlineDeps = {
    releaseOverdueSubmissions: step("release", script.released ?? 0),
    sendReviewReminders: step("remind", script.reminded ?? 0),
    deleteOrphanProofFiles: step("orphans", script.orphans ?? []),
  };
  return { deps, calls };
}

test("runs release, then reminders, then orphans, and reports each count", async () => {
  const { deps, calls } = fakes({
    released: 2,
    reminded: 3,
    orphans: ["u1/a.webp", "u2/b.webp"],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, ["release", "remind", "orphans"]);
  assert.deepEqual(result, { released: 2, reminded: 3, orphans: 2 });
  assert.equal(cronStatus(result), 200);
  assert.equal(logged.length, 0);
});

test("nothing due is a 200 with zeros", async () => {
  const { deps } = fakes();
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(result, { released: 0, reminded: 0, orphans: 0 });
  assert.equal(cronStatus(result), 200);
});

test("a failing release still sends reminders and clears orphans, and answers 500", async () => {
  const { deps, calls } = fakes({
    released: new Error("boom (XX000)"),
    reminded: 1,
    orphans: ["u1/a.webp"],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, ["release", "remind", "orphans"]);
  assert.deepEqual(result, { released: null, reminded: 1, orphans: 1 });
  assert.equal(cronStatus(result), 500);
  assert.deepEqual(logged, ["auto-release failed Error"]);
});

test("a failing reminder step does not stop the orphan step", async () => {
  const { deps, calls } = fakes({
    released: 1,
    reminded: new Error("review reminders failed (XX000)"),
    orphans: [],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, ["release", "remind", "orphans"]);
  assert.deepEqual(result, { released: 1, reminded: null, orphans: 0 });
  assert.equal(cronStatus(result), 500);
});

test("a failing orphan step answers 500 after the money steps ran", async () => {
  const { deps } = fakes({
    released: 1,
    reminded: 1,
    orphans: new Error("orphan files failed (XX000)"),
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(result, { released: 1, reminded: 1, orphans: null });
  assert.equal(cronStatus(result), 500);
});

test("logs carry the error class only, never its message", async () => {
  const { deps } = fakes({
    released: new TypeError("secret sk_test_SECRETVALUE"),
  });
  await runReviewDeadlines(deps);
  const text = logged.join("\n");
  assert.match(text, /TypeError/);
  assert.equal(text.includes("SECRETVALUE"), false);
});
