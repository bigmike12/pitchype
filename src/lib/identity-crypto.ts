// Keyed fingerprints of NIN and BVN numbers (design §6.2). A fingerprint lets
// us notice the same ID on two accounts, and match a re-typed BVN, without
// keeping the number. Computed on the server only. Error messages never carry
// the digits or the key.

import { createHmac } from "node:crypto";

const VERSION = "v1";

export class IdentityCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityCryptoError";
  }
}

function key(): Buffer {
  const text = process.env.IDENTITY_FINGERPRINT_KEY ?? "";
  if (text === "") {
    throw new IdentityCryptoError("The identity fingerprint key is not set");
  }
  const bytes = Buffer.from(text, "base64");
  if (bytes.length !== 32) {
    throw new IdentityCryptoError(
      "The identity fingerprint key must be 32 bytes, base64 encoded",
    );
  }
  return bytes;
}

/**
 * `v1:` + hex HMAC-SHA256 over "<NIN|BVN>:<digits>". The kind is part of the
 * message so a NIN and a BVN with the same digits never collide.
 */
export function identityFingerprint(
  kind: "NIN" | "BVN",
  digits: string,
): string {
  if (!/^\d{11}$/.test(digits)) {
    throw new IdentityCryptoError("A NIN or BVN is exactly 11 digits");
  }
  const hex = createHmac("sha256", key())
    .update(`${kind}:${digits}`)
    .digest("hex");
  return `${VERSION}:${hex}`;
}

export function lastThree(digits: string): string {
  return digits.slice(-3);
}
