// The only code that encrypts or decrypts a creator's full bank account number
// (CLAUDE.md §7). AES-256-GCM with a random 12-byte IV, stored as
// `v1:<iv b64>:<tag b64>:<ciphertext b64>` so the key can be rotated later by
// adding a v2. Decrypt only on the server, in the payout send path: the plain
// number never reaches a log, an error message, the browser, a notification or
// a stored payload.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Messages say what went wrong, never the number or the key. */
export class AccountCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountCryptoError";
  }
}

function key(): Buffer {
  const text = process.env.BANK_ACCOUNT_ENCRYPTION_KEY ?? "";
  if (text === "") {
    throw new AccountCryptoError("The bank account encryption key is not set");
  }
  const bytes = Buffer.from(text, "base64");
  if (bytes.length !== 32) {
    throw new AccountCryptoError(
      "The bank account encryption key must be 32 bytes, base64 encoded",
    );
  }
  return bytes;
}

export function encryptAccountNumber(plain: string): string {
  if (!/^\d{10}$/.test(plain)) {
    throw new AccountCryptoError("A bank account number is 10 digits");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptAccountNumber(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new AccountCryptoError("Unreadable stored bank account number");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new AccountCryptoError("Unreadable stored bank account number");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch (error) {
    if (error instanceof AccountCryptoError) throw error;
    throw new AccountCryptoError("Could not decrypt the stored bank account number");
  }
}
