import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseDuplicateForm,
  parseFeedbackForm,
  parseStatusForm,
} from "./feedback.ts";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const ID = "0b6f5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

test("a feedback request parses, trimmed", () => {
  const parsed = parseFeedbackForm(
    form({ kind: "idea", title: "  Dark mode ", details: " Please add one. " }),
  );
  assert.deepEqual(parsed, {
    ok: true,
    value: { kind: "idea", title: "Dark mode", details: "Please add one." },
  });
});

test("the shortest and longest requests are accepted", () => {
  assert.ok(
    parseFeedbackForm(
      form({ kind: "problem", title: "abc", details: "a".repeat(10) }),
    ).ok,
  );
  assert.ok(
    parseFeedbackForm(
      form({ kind: "idea", title: "a".repeat(120), details: "a".repeat(2000) }),
    ).ok,
  );
});

for (const [field, value] of [
  ["kind", "bug"],
  ["title", "ab"],
  ["title", "a".repeat(121)],
  ["details", "a".repeat(9)],
  ["details", "a".repeat(2001)],
] as const) {
  test(`feedback ${field} of ${value.length} characters (${value.slice(0, 3)}…) is refused`, () => {
    const parsed = parseFeedbackForm(
      form({
        kind: "idea",
        title: "Dark mode",
        details: "Please add one.",
        [field]: value,
      }),
    );
    assert.ok(!parsed.ok);
    assert.ok(parsed.errors[field], `expected an error on ${field}`);
  });
}

test("a status change parses, a blank note is no note", () => {
  assert.deepEqual(
    parseStatusForm(form({ id: ID, status: "shipped", note: "  " })),
    { ok: true, value: { id: ID, status: "shipped", note: null } },
  );
  assert.deepEqual(
    parseStatusForm(form({ id: ID, status: "planned", note: " Soon " })),
    { ok: true, value: { id: ID, status: "planned", note: "Soon" } },
  );
});

test("a status change refuses an unknown status or a long note", () => {
  const bad = parseStatusForm(form({ id: ID, status: "done", note: "" }));
  assert.ok(!bad.ok && bad.errors.status);
  const long = parseStatusForm(
    form({ id: ID, status: "planned", note: "a".repeat(1001) }),
  );
  assert.ok(!long.ok && long.errors.note);
  assert.ok(
    parseStatusForm(form({ id: ID, status: "planned", note: "a".repeat(1000) }))
      .ok,
  );
});

test("a request number may be typed with or without #", () => {
  assert.deepEqual(parseDuplicateForm(form({ id: ID, main: "#42" })), {
    ok: true,
    value: { id: ID, mainNumber: 42 },
  });
  assert.deepEqual(parseDuplicateForm(form({ id: ID, main: " 42 " })), {
    ok: true,
    value: { id: ID, mainNumber: 42 },
  });
});

test("a request number must be a positive whole number", () => {
  for (const main of ["0", "x", "", "4.5", "-3"]) {
    const parsed = parseDuplicateForm(form({ id: ID, main }));
    assert.ok(!parsed.ok && parsed.errors.main, main);
  }
});
