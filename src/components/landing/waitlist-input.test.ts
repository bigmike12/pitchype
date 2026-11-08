import assert from "node:assert/strict";
import { test } from "node:test";

import { HONEYPOT_FIELD, parseWaitlistForm } from "./waitlist-input.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

test("accepts a valid signup and normalises the email", () => {
  assert.deepEqual(
    parseWaitlistForm(form({ email: "  Ada@Example.COM ", role: "creator" })),
    { kind: "valid", email: "ada@example.com", role: "creator" },
  );
  assert.deepEqual(
    parseWaitlistForm(form({ email: "shop@bukka.ng", role: "business" })),
    { kind: "valid", email: "shop@bukka.ng", role: "business" },
  );
});

test("rejects a missing or malformed email", () => {
  for (const email of [
    "",
    "   ",
    "ada",
    "ada@",
    "@example.com",
    "ada@example",
    "a da@example.com",
  ]) {
    const result = parseWaitlistForm(form({ email, role: "creator" }));
    assert.equal(result.kind, "invalid", `expected "${email}" to be rejected`);
  }
});

test("rejects an email longer than 254 characters", () => {
  const email = `${"a".repeat(250)}@x.co`;
  assert.equal(
    parseWaitlistForm(form({ email, role: "creator" })).kind,
    "invalid",
  );
});

test("rejects a missing or unknown role", () => {
  for (const role of ["", "admin", "Business", "influencer"]) {
    const result = parseWaitlistForm(form({ email: "ada@example.com", role }));
    assert.equal(
      result.kind,
      "invalid",
      `expected role "${role}" to be rejected`,
    );
  }
  assert.equal(
    parseWaitlistForm(form({ email: "ada@example.com" })).kind,
    "invalid",
  );
});

test("echoes what was typed back on failure", () => {
  const result = parseWaitlistForm(form({ email: "Ada@", role: "creator" }));
  assert.equal(result.kind, "invalid");
  if (result.kind === "invalid") {
    assert.equal(result.email, "ada@");
    assert.equal(result.role, "creator");
  }
});

test("treats a filled honeypot as a bot, even with otherwise valid input", () => {
  const result = parseWaitlistForm(
    form({
      email: "ada@example.com",
      role: "creator",
      [HONEYPOT_FIELD]: "https://spam.example",
    }),
  );
  assert.deepEqual(result, { kind: "bot" });
});

test("ignores non-text values", () => {
  const data = new FormData();
  data.set("email", new Blob(["ada@example.com"]));
  data.set("role", "creator");
  assert.equal(parseWaitlistForm(data).kind, "invalid");
});
