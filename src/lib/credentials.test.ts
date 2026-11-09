import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseEmailForm,
  parseLoginForm,
  parseNewPasswordForm,
  parseSignUpForm,
} from "./credentials.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

test("sign-up accepts a business or creator and normalises the email", () => {
  assert.deepEqual(
    parseSignUpForm(
      form({
        email: " Ada@Example.COM ",
        password: "long enough",
        role: "business",
      }),
    ),
    {
      ok: true,
      value: {
        email: "ada@example.com",
        password: "long enough",
        role: "business",
      },
    },
  );
  assert.equal(
    parseSignUpForm(
      form({ email: "b@x.ng", password: "12345678", role: "influencer" }),
    ).ok,
    true,
  );
});

test("sign-up never lets someone choose admin or an unknown role", () => {
  for (const role of ["admin", "", "creator", "Business"]) {
    const result = parseSignUpForm(
      form({ email: "a@x.ng", password: "12345678", role }),
    );
    assert.equal(result.ok, false, `role "${role}" should be rejected`);
    if (!result.ok) assert.ok(result.errors.role);
  }
});

test("sign-up passwords need 8 to 72 bytes and are not trimmed", () => {
  const short = parseSignUpForm(
    form({ email: "a@x.ng", password: "1234567", role: "business" }),
  );
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.errors.password ?? "", /at least 8/);

  const long = parseSignUpForm(
    form({ email: "a@x.ng", password: "a".repeat(73), role: "business" }),
  );
  assert.equal(long.ok, false);

  // Multi-byte characters count as bytes: 25 × 3-byte "₦" = 75 bytes.
  const multibyte = parseSignUpForm(
    form({ email: "a@x.ng", password: "₦".repeat(25), role: "business" }),
  );
  assert.equal(multibyte.ok, false);

  const spaces = parseSignUpForm(
    form({ email: "a@x.ng", password: "  pass word  ", role: "business" }),
  );
  assert.equal(spaces.ok && spaces.value.password, "  pass word  ");
});

test("failed parses echo the email and role but never the password", () => {
  const result = parseSignUpForm(
    form({ email: "Ada@", password: "secret", role: "business" }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.values, { email: "ada@", role: "business" });
    assert.ok(result.errors.email);
    assert.ok(result.errors.password);
  }
});

test("login checks presence only, not password rules", () => {
  assert.equal(
    parseLoginForm(form({ email: "a@x.ng", password: "short" })).ok,
    true,
  );
  const empty = parseLoginForm(form({ email: "", password: "" }));
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.ok(empty.errors.email);
    assert.ok(empty.errors.password);
  }
});

test("email-only and new-password forms", () => {
  assert.deepEqual(parseEmailForm(form({ email: " A@X.NG " })), {
    ok: true,
    value: { email: "a@x.ng" },
  });
  assert.equal(parseEmailForm(form({ email: "nope" })).ok, false);
  assert.equal(parseNewPasswordForm(form({ password: "12345678" })).ok, true);
  assert.equal(parseNewPasswordForm(form({ password: "1234" })).ok, false);
});
