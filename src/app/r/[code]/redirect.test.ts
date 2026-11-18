import assert from "node:assert/strict";
import { test } from "node:test";

import { hashVisitor } from "../../../lib/clicks.ts";

import {
  handleLinkHit,
  type LinkHitDeps,
  type RecordInput,
} from "./redirect.ts";

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const LINK = {
  destination: "https://konga.com/x",
  utmTags: true,
  campaignId: "c1",
};
const TAGGED =
  "https://konga.com/x?utm_source=pitchype&utm_medium=creator&utm_campaign=c1&utm_content=k7Xq2ab";

function hit(code: string, init: { method?: string; ua?: string | null } = {}) {
  const headers = new Headers();
  if (init.ua !== null) headers.set("user-agent", init.ua ?? SAFARI);
  return { code, method: init.method ?? "GET", ip: "1.2.3.4", headers };
}

function deps(over: Partial<LinkHitDeps> = {}) {
  const calls = {
    record: [] as RecordInput[],
    lookup: 0,
    logs: [] as string[],
  };
  const d: LinkHitDeps = {
    secret: "s3cret",
    record: async (input) => {
      calls.record.push(input);
      return LINK;
    },
    lookup: async () => {
      calls.lookup += 1;
      return LINK;
    },
    log: (line) => {
      calls.logs.push(line);
    },
    ...over,
  };
  return { d, calls };
}

test("a known link redirects to the tagged destination", async () => {
  const { d } = deps();
  assert.deepEqual(await handleLinkHit(hit("k7Xq2ab"), d), {
    status: 302,
    location: TAGGED,
  });
});

test("a malformed code is a 404 and records nothing", async () => {
  for (const code of ["../x", "abc", "k".repeat(200), "k7Xq-ab"]) {
    const { d, calls } = deps();
    assert.deepEqual(await handleLinkHit(hit(code), d), { status: 404 }, code);
    assert.equal(calls.record.length, 0);
    assert.equal(calls.lookup, 0);
  }
});

test("an unknown code is a 404", async () => {
  const { d } = deps({ record: async () => null });
  assert.deepEqual(await handleLinkHit(hit("k7Xq2ab"), d), { status: 404 });
});

test("if recording fails the visitor still lands, and one line is logged", async () => {
  const { d, calls } = deps({
    record: async () => {
      throw new Error("db down");
    },
  });
  assert.deepEqual(await handleLinkHit(hit("k7Xq2ab"), d), {
    status: 302,
    location: TAGGED,
  });
  assert.equal(calls.lookup, 1);
  assert.equal(calls.logs.length, 1);
  assert.ok(calls.logs[0].includes("k7Xq2ab"));
  assert.ok(!calls.logs[0].includes("1.2.3.4"));
});

test("without the hashing secret nothing is recorded, but the visitor lands", async () => {
  const { d, calls } = deps({ secret: undefined });
  assert.deepEqual(await handleLinkHit(hit("k7Xq2ab"), d), {
    status: 302,
    location: TAGGED,
  });
  assert.equal(calls.record.length, 0);
  assert.equal(calls.lookup, 1);
  assert.equal(calls.logs.length, 1);
});

test("if recording and the lookup both fail, it's a 404", async () => {
  const fail = async () => {
    throw new Error("db down");
  };
  const { d } = deps({ record: fail, lookup: fail });
  assert.deepEqual(await handleLinkHit(hit("k7Xq2ab"), d), { status: 404 });
});

test("a WhatsApp preview is recorded as one, and still redirected", async () => {
  const { d, calls } = deps();
  const result = await handleLinkHit(
    hit("k7Xq2ab", { method: "HEAD", ua: "WhatsApp/2.23.20.0 A" }),
    d,
  );
  assert.equal(result.status, 302);
  assert.equal(calls.record[0].clientClass, "preview");
  assert.equal(calls.record[0].source, "whatsapp");
});

test("the visitor is recorded as a keyed hash, never the IP", async () => {
  const { d, calls } = deps();
  await handleLinkHit(hit("k7Xq2ab"), d);
  const input = calls.record[0];
  assert.equal(input.visitorHash, hashVisitor("s3cret", "1.2.3.4", SAFARI));
  assert.ok(!JSON.stringify(input).includes("1.2.3.4"));
});
