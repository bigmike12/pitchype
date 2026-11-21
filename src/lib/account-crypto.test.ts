import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  AccountCryptoError,
  decryptAccountNumber,
  encryptAccountNumber,
} from "./account-crypto.ts";

const KEY = randomBytes(32).toString("base64");
const saved = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  if (saved === undefined) delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  else process.env.BANK_ACCOUNT_ENCRYPTION_KEY = saved;
});

test("a number survives encrypt then decrypt", () => {
  const stored = encryptAccountNumber("0123456789");
  assert.match(stored, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.equal(decryptAccountNumber(stored), "0123456789");
  assert.ok(!stored.includes("0123456789"));
});

test("two encryptions of the same number differ", () => {
  assert.notEqual(
    encryptAccountNumber("0123456789"),
    encryptAccountNumber("0123456789"),
  );
});

test("a changed ciphertext is refused", () => {
  const [version, iv, tag, ciphertext] =
    encryptAccountNumber("0123456789").split(":");
  const bytes = Buffer.from(ciphertext, "base64");
  bytes[0] ^= 1;
  const tampered = [version, iv, tag, bytes.toString("base64")].join(":");
  assert.throws(() => decryptAccountNumber(tampered), AccountCryptoError);
});

test("a changed tag is refused", () => {
  const [version, iv, tag, ciphertext] =
    encryptAccountNumber("0123456789").split(":");
  const bytes = Buffer.from(tag, "base64");
  bytes[0] ^= 1;
  const tampered = [version, iv, bytes.toString("base64"), ciphertext].join(
    ":",
  );
  assert.throws(() => decryptAccountNumber(tampered), AccountCryptoError);
});

test("a different key cannot decrypt", () => {
  const stored = encryptAccountNumber("0123456789");
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptAccountNumber(stored), AccountCryptoError);
});

test("malformed or unknown-version input is refused", () => {
  for (const bad of ["v2:a:b:c", "garbage", "", "v1:a:b", "v1:::"]) {
    assert.throws(() => decryptAccountNumber(bad), AccountCryptoError, bad);
  }
});

test("a missing or short key is refused", () => {
  delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  assert.throws(() => encryptAccountNumber("0123456789"), AccountCryptoError);
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = randomBytes(16).toString("base64");
  assert.throws(() => encryptAccountNumber("0123456789"), AccountCryptoError);
  assert.throws(
    () =>
      decryptAccountNumber("v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AA=="),
    AccountCryptoError,
  );
});

test("only ten digit numbers are encrypted", () => {
  for (const bad of ["12345", "01234567890", "abcdefghij", ""]) {
    assert.throws(() => encryptAccountNumber(bad), AccountCryptoError, bad);
  }
});

test("no error message contains the number", () => {
  const messages: string[] = [];
  for (const run of [
    () => encryptAccountNumber("0123456789x"),
    () => decryptAccountNumber("v1:0123456789:0123456789:0123456789"),
    () => {
      process.env.BANK_ACCOUNT_ENCRYPTION_KEY = "0123456789";
      encryptAccountNumber("0123456789");
    },
  ]) {
    try {
      run();
    } catch (error) {
      messages.push(error instanceof Error ? error.message : "");
    }
  }
  assert.equal(messages.length, 3);
  for (const message of messages) assert.ok(!message.includes("0123456789"));
});
