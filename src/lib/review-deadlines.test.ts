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
  released?: { released: number; failed: number } | Error;
  reminded?: number | Error;
  orphans?: string[] | Error;
  deleted?: Error;
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
    releaseOverdueSubmissions: step(
      "release",
      script.released ?? { released: 0, failed: 0 },
    ),
    sendReviewReminders: step("remind", script.reminded ?? 0),
    deleteOrphanProofFiles: step("orphans", script.orphans ?? []),
    deleteProofObjects: async (paths) => {
      calls.push("delete:" + paths.join(","));
      await Promise.resolve();
      if (script.deleted) throw script.deleted;
    },
  };
  return { deps, calls };
}

test("runs release, then reminders, then orphans, and reports each count", async () => {
  const { deps, calls } = fakes({
    released: { released: 2, failed: 0 },
    reminded: 3,
    orphans: ["u1/a.webp", "u2/b.webp"],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, [
    "release",
    "remind",
    "orphans",
    "delete:u1/a.webp,u2/b.webp",
  ]);
  assert.deepEqual(result, {
    released: 2,
    releaseFailed: 0,
    reminded: 3,
    orphans: 2,
    proofObjectsFailed: 0,
  });
  assert.equal(cronStatus(result), 200);
  assert.equal(logged.length, 0);
});

test("nothing due is a 200 with zeros", async () => {
  const { deps } = fakes();
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(result, {
    released: 0,
    releaseFailed: 0,
    reminded: 0,
    orphans: 0,
    proofObjectsFailed: 0,
  });
  assert.equal(cronStatus(result), 200);
});

test("a failing release still sends reminders and clears orphans, and answers 500", async () => {
  const { deps, calls } = fakes({
    released: new Error("boom (XX000)"),
    reminded: 1,
    orphans: ["u1/a.webp"],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, ["release", "remind", "orphans", "delete:u1/a.webp"]);
  assert.deepEqual(result, {
    released: null,
    releaseFailed: null,
    reminded: 1,
    orphans: 1,
    proofObjectsFailed: 0,
  });
  assert.equal(cronStatus(result), 500);
  assert.deepEqual(logged, ["auto-release failed Error"]);
});

test("a failing reminder step does not stop the orphan step", async () => {
  const { deps, calls } = fakes({
    released: { released: 1, failed: 0 },
    reminded: new Error("review reminders failed (XX000)"),
    orphans: [],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, ["release", "remind", "orphans"]);
  assert.deepEqual(result, {
    released: 1,
    releaseFailed: 0,
    reminded: null,
    orphans: 0,
    proofObjectsFailed: 0,
  });
  assert.equal(cronStatus(result), 500);
});

test("a failing orphan step answers 500 after the money steps ran", async () => {
  const { deps } = fakes({
    released: { released: 1, failed: 0 },
    reminded: 1,
    orphans: new Error("orphan files failed (XX000)"),
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(result, {
    released: 1,
    releaseFailed: 0,
    reminded: 1,
    orphans: null,
    proofObjectsFailed: 0,
  });
  assert.equal(cronStatus(result), 500);
});

test("hires that couldn't be released answer 500 with one log line of the count, after the other steps ran", async () => {
  const { deps, calls } = fakes({
    released: { released: 3, failed: 2 },
    reminded: 1,
    orphans: [],
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, ["release", "remind", "orphans"]);
  assert.deepEqual(result, {
    released: 3,
    releaseFailed: 2,
    reminded: 1,
    orphans: 0,
    proofObjectsFailed: 0,
  });
  assert.equal(cronStatus(result), 500);
  assert.deepEqual(logged, ["auto-release failed for hires 2"]);
});

test("cronStatus is 200 only when every step worked and no hire failed", () => {
  const ok = {
    released: 1,
    releaseFailed: 0,
    reminded: 0,
    orphans: 0,
    proofObjectsFailed: 0,
  };
  assert.equal(cronStatus(ok), 200);
  assert.equal(cronStatus({ ...ok, releaseFailed: 1 }), 500);
  assert.equal(cronStatus({ ...ok, released: null, releaseFailed: null }), 500);
  assert.equal(cronStatus({ ...ok, reminded: null }), 500);
  assert.equal(cronStatus({ ...ok, orphans: null }), 500);
  assert.equal(cronStatus({ ...ok, proofObjectsFailed: 1 }), 500);
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

test("files are deleted from storage only after their rows were removed, and only when there are some", async () => {
  const { deps, calls } = fakes({ orphans: ["u1/a.webp"] });
  await runReviewDeadlines(deps);
  assert.ok(calls.indexOf("orphans") < calls.indexOf("delete:u1/a.webp"));
  const none = fakes();
  await runReviewDeadlines(none.deps);
  assert.deepEqual(none.calls, ["release", "remind", "orphans"]);
});

test("a storage delete failure answers 500 with the count only, and the other steps still ran", async () => {
  const { deps, calls } = fakes({
    released: { released: 1, failed: 0 },
    reminded: 1,
    orphans: ["u1/secret-name.webp", "u2/other.webp"],
    deleted: new Error("could not remove u1/secret-name.webp"),
  });
  const result = await runReviewDeadlines(deps);
  assert.deepEqual(calls, [
    "release",
    "remind",
    "orphans",
    "delete:u1/secret-name.webp,u2/other.webp",
  ]);
  assert.deepEqual(result, {
    released: 1,
    releaseFailed: 0,
    reminded: 1,
    orphans: 2,
    proofObjectsFailed: 2,
  });
  assert.equal(cronStatus(result), 500);
  assert.deepEqual(logged, ["proof file delete failed for 2"]);
});
