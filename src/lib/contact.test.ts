import assert from "node:assert/strict";
import { test } from "node:test";

import {
  contactEmail,
  honeypotFilled,
  parseContactForm,
  type ContactMessage,
} from "./contact.ts";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const valid = {
  name: " Ada ",
  email: "ada@example.com",
  topic: "account",
  message: "Ten chars!!",
  form_id: "0b6f5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
};

test("a filled-in contact form parses, trimmed", () => {
  const parsed = parseContactForm(form(valid));
  assert.ok(parsed.ok);
  assert.equal(parsed.value.name, "Ada");
  assert.equal(parsed.value.email, "ada@example.com");
  assert.equal(parsed.value.topic, "account");
  assert.equal(parsed.value.formId, valid.form_id);
});

for (const [field, value] of [
  ["name", ""],
  ["name", "a".repeat(81)],
  ["email", "ada@"],
  ["topic", "sales"],
  ["message", "a".repeat(9)],
  ["message", "a".repeat(2001)],
] as const) {
  test(`${field} ${JSON.stringify(value.slice(0, 12))}${value.length > 12 ? "…" : ""} is refused`, () => {
    const parsed = parseContactForm(form({ ...valid, [field]: value }));
    assert.ok(!parsed.ok);
    assert.ok(parsed.errors[field], `expected an error on ${field}`);
    // What was typed comes back, so the form can show it again.
    assert.equal(parsed.values[field], field === "topic" ? value : value.trim());
  });
}

test("the longest allowed name and message are accepted", () => {
  const parsed = parseContactForm(
    form({ ...valid, name: "a".repeat(80), message: "a".repeat(2000) }),
  );
  assert.ok(parsed.ok);
});

test("a missing or malformed form id gets a fresh one", () => {
  const parsed = parseContactForm(form({ ...valid, form_id: "not-a-uuid" }));
  assert.ok(parsed.ok);
  assert.match(
    parsed.value.formId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});

test("the honeypot counts only when something is in it", () => {
  assert.equal(honeypotFilled(form({ company_website: "x" })), true);
  assert.equal(honeypotFilled(form({ company_website: "  " })), false);
  assert.equal(honeypotFilled(form({})), false);
});

const message: ContactMessage = {
  name: "Ada",
  email: "ada@example.com",
  topic: "account",
  message: "<script>alert(1)</script>",
  formId: valid.form_id,
};

test("the email names the topic and the sender in its subject", () => {
  assert.equal(
    contactEmail(message).subject,
    "Contact: Help with my account from Ada",
  );
});

test("the email escapes what was typed in its HTML", () => {
  const { html } = contactEmail(message);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});

test("the plain-text email carries the address and the message", () => {
  const { text } = contactEmail(message);
  assert.ok(text.includes("ada@example.com"));
  assert.ok(text.includes("<script>alert(1)</script>"));
});
