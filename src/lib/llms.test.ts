import assert from "node:assert/strict";
import { test } from "node:test";

import { HOME_FAQ } from "./faq.ts";
import { buildLlmsTxt } from "./llms.ts";
import { CONTACT_EMAIL, SITE_DESCRIPTION, SITE_URL } from "./site.ts";

const text = buildLlmsTxt();

test("follows the llms.txt shape: a title, a one-line summary, then sections", () => {
  const lines = text.split("\n");
  assert.equal(lines[0], "# Pitchype");
  assert.equal(lines[2], `> ${SITE_DESCRIPTION}`);
  assert.ok(text.includes("\n## Pages\n"));
  assert.ok(text.includes("\n## Frequently asked questions\n"));
});

test("every link is an absolute link on our own site", () => {
  const links = [...text.matchAll(/\]\((\S+?)\)/g)].map((match) => match[1]);
  assert.ok(links.length >= 5);
  for (const link of links) {
    assert.ok(link.startsWith(`${SITE_URL}/`), `${link} is not on ${SITE_URL}`);
  }
});

test("lists the public pages and the sitemap", () => {
  for (const path of [
    "/",
    "/for-business",
    "/for-creators",
    "/how-escrow-works",
    "/creators",
    "/sitemap.xml",
  ]) {
    assert.ok(text.includes(`](${SITE_URL}${path})`), `missing ${path}`);
  }
});

test("leaves out pages that are drafts or signed-in only", () => {
  for (const path of ["/privacy", "/terms", "/login", "/signup", "/home"]) {
    assert.ok(
      !text.includes(`${SITE_URL}${path}`),
      `${path} should not be listed`,
    );
  }
  assert.ok(!text.includes("/admin"));
  assert.ok(!text.includes("/api/"));
});

test("repeats the site's own questions and answers, word for word", () => {
  for (const { question, answer } of HOME_FAQ) {
    assert.ok(text.includes(question), question);
    assert.ok(text.includes(answer), question);
  }
});

test("says what stays private on a creator's page", () => {
  assert.match(text, /handles.*rates.*signed-in businesses/i);
});

test("ends with the contact address and a single newline", () => {
  assert.ok(text.includes(CONTACT_EMAIL));
  assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
});
