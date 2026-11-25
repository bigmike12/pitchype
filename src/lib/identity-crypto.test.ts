import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  IdentityCryptoError,
  identityFingerprint,
  lastThree,
} from "./identity-crypto.ts";

const KEY = randomBytes(32).toString("base64");
const saved = process.env.IDENTITY_FINGERPRINT_KEY;

beforeEach(() => {
  process.env.IDENTITY_FINGERPRINT_KEY = KEY;
});

afterEach(() => {
  if (saved === undefined) delete process.env.IDENTITY_FINGERPRINT_KEY;
  else process.env.IDENTITY_FINGERPRINT_KEY = saved;
});

test("a fingerprint is stable and versioned", () => {
  const a = identityFingerprint("NIN", "70123456789");
  assert.equal(a, identityFingerprint("NIN", "70123456789"));
  assert.match(a, /^v1:[0-9a-f]{64}$/);
  assert.ok(!a.includes("70123456789"));
});

test("the same digits as a NIN and as a BVN never collide", () => {
  assert.notEqual(
    identityFingerprint("NIN", "22222222222"),
    identityFingerprint("BVN", "22222222222"),
  );
});

test("another key gives another fingerprint", () => {
  const first = identityFingerprint("BVN", "22222222222");
  process.env.IDENTITY_FINGERPRINT_KEY = randomBytes(32).toString("base64");
  assert.notEqual(first, identityFingerprint("BVN", "22222222222"));
});

test("a wrong length of digits is refused without echoing them", () => {
  assert.throws(
    () => identityFingerprint("NIN", "1234"),
    (error: unknown) =>
      error instanceof IdentityCryptoError && !error.message.includes("1234"),
  );
  assert.throws(
    () => identityFingerprint("NIN", "1234567890a"),
    IdentityCryptoError,
  );
});

test("a missing or short key is refused", () => {
  delete process.env.IDENTITY_FINGERPRINT_KEY;
  assert.throws(
    () => identityFingerprint("NIN", "70123456789"),
    IdentityCryptoError,
  );
  process.env.IDENTITY_FINGERPRINT_KEY = randomBytes(16).toString("base64");
  assert.throws(
    () => identityFingerprint("NIN", "70123456789"),
    IdentityCryptoError,
  );
});

test("lastThree keeps only the final three digits", () => {
  assert.equal(lastThree("70123456789"), "789");
});
