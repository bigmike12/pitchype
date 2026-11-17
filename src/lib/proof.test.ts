import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseDenialReasons,
  parseProofLinks,
  parseProofNote,
} from "./proof.ts";

test("no links and no screenshots is refused", () => {
  assert.deepEqual(parseProofLinks("", 0), {
    ok: false,
    message: "Add a link or a screenshot.",
  });
  assert.deepEqual(parseProofLinks("  \n \n", 0), {
    ok: false,
    message: "Add a link or a screenshot.",
  });
});

test("no links is fine when a screenshot is attached", () => {
  assert.deepEqual(parseProofLinks("", 1), { ok: true, links: [] });
});

test("links are one per line, trimmed, blank lines ignored", () => {
  assert.deepEqual(
    parseProofLinks(
      "  https://instagram.com/p/a  \n\n\r\nhttp://tiktok.com/v/1\r\n",
    ),
    { ok: true, links: ["https://instagram.com/p/a", "http://tiktok.com/v/1"] },
  );
});

test("duplicate links collapse to the first", () => {
  assert.deepEqual(
    parseProofLinks("https://x.com/a\nhttps://x.com/b\nhttps://x.com/a"),
    { ok: true, links: ["https://x.com/a", "https://x.com/b"] },
  );
});

test("eleven links are refused, ten are fine", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => `https://x.com/p/${i}`).join("\n");
  assert.equal(parseProofLinks(many(11)).ok, false);
  assert.equal(parseProofLinks(many(10)).ok, true);
});

test("eleven lines that collapse to ten are fine", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `https://x.com/p/${i}`);
  assert.equal(parseProofLinks([...lines, lines[0]].join("\n")).ok, true);
});

test("only http and https links are accepted", () => {
  for (const bad of [
    "javascript:alert(1)",
    "ftp://x.com/file",
    "data:text/html,hi",
    "instagram.com/p/a",
    "https://",
    "https:// not a link",
    "https://x.com/post and more text",
    "https://x.com/post\u00a0and",
  ]) {
    assert.equal(parseProofLinks(bad).ok, false, bad);
  }
  assert.equal(parseProofLinks("HTTPS://X.com/a").ok, true);
});

test("a link of 500 characters is fine, 501 is refused", () => {
  const at = (n: number) =>
    "https://x.com/" + "a".repeat(n - "https://x.com/".length);
  assert.equal(parseProofLinks(at(500)).ok, true);
  assert.equal(parseProofLinks(at(501)).ok, false);
});

test("a note is trimmed, optional and up to 1,000 characters", () => {
  assert.deepEqual(parseProofNote("  Posted Monday  "), {
    ok: true,
    note: "Posted Monday",
  });
  assert.deepEqual(parseProofNote("   "), { ok: true, note: null });
  assert.equal(parseProofNote("n".repeat(1000)).ok, true);
  assert.equal(parseProofNote("n".repeat(1001)).ok, false);
});

test("denial reasons: none, too short and too many are refused", () => {
  assert.equal(parseDenialReasons([]).ok, false);
  assert.equal(parseDenialReasons(["", "  "]).ok, false);
  assert.equal(parseDenialReasons(["no"]).ok, false);
  assert.equal(parseDenialReasons(Array(6).fill("Wrong hashtag")).ok, false);
  assert.equal(parseDenialReasons(["r".repeat(501)]).ok, false);
});

test("five valid reasons are accepted, trimmed, blanks skipped", () => {
  assert.deepEqual(
    parseDenialReasons([
      " Wrong hashtag ",
      "",
      "No logo",
      "Posted late",
      "Link is private",
      "Caption missing",
    ]),
    {
      ok: true,
      reasons: [
        "Wrong hashtag",
        "No logo",
        "Posted late",
        "Link is private",
        "Caption missing",
      ],
    },
  );
  assert.equal(parseDenialReasons(["abc", "r".repeat(500)]).ok, true);
});
