// The Cray Finance boundary (CLAUDE.md §2a): the only file that talks to Cray.
// Plain functions over fetch, like paystack.ts. No retries: callers use
// idempotent references and try again themselves.
//
// Cray speaks naira with decimals ("3950.00000000", 0.95); the rest of the app
// speaks integer kobo. koboToNaira and nairaToKobo are the only places the two
// meet, and neither ever multiplies a float.
//
// Every call carries a Bearer key (one scope per key) and an ES256 signature
// over the method, path, time, a fresh nonce and the hash of the exact body
// sent. Keys, the signing key and full account numbers are never logged or
// returned in an error.
//
// No `import "server-only"`: node tests cannot resolve it. None of these
// variables has a NEXT_PUBLIC_ prefix, so Next never bundles them into client code.

import {
  createHash,
  createPrivateKey,
  randomUUID,
  sign as signBytes,
} from "node:crypto";

const TIMEOUT_MS = 15_000;

/**
 * `status` is the HTTP status, or 0 when no answer came back (network,
 * timeout, bad input). `code` is Cray's `code` field when it sent one, or our
 * own "insufficient_balance" / "duplicate_reference" (see disburse).
 */
export class CrayError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "CrayError";
    this.status = status;
    this.code = code;
  }
}

function secrets(): string[] {
  return [
    process.env.CRAY_COLLECTION_API_KEY ?? "",
    process.env.CRAY_DISBURSEMENT_API_KEY ?? "",
    process.env.CRAY_SIGNING_PRIVATE_KEY ?? "",
    process.env.CRAY_SUBACCOUNT_TOKEN ?? "",
    ...(process.env.CRAY_WEBHOOK_KEYS ?? "").split(",").map((k) => k.trim()),
  ].filter((value) => value !== "");
}

/** Strips every Cray key and masks long digit runs (account numbers) to the last four. */
function safeMessage(message: string): string {
  let result = message;
  for (const secret of secrets()) result = result.split(secret).join("[key]");
  return result.replace(/\d{10,}/g, (digits) => `******${digits.slice(-4)}`);
}

function fail(message: string, status = 0, code: string | null = null): never {
  throw new CrayError(safeMessage(message), status, code);
}

/** True when everything a Cray call needs is set (the admin switch checks this). */
export function isCrayConfigured(): boolean {
  return (
    (process.env.CRAY_BASE_URL ?? "") !== "" &&
    (process.env.CRAY_COLLECTION_API_KEY ?? "") !== "" &&
    (process.env.CRAY_DISBURSEMENT_API_KEY ?? "") !== "" &&
    (process.env.CRAY_SIGNING_PRIVATE_KEY ?? "") !== "" &&
    (process.env.CRAY_SIGNING_KEY_ID ?? "") !== "" &&
    (process.env.CRAY_SUBACCOUNT_TOKEN ?? "") !== "" &&
    (process.env.CRAY_WEBHOOK_KEYS ?? "").trim() !== ""
  );
}

// ---- naira <-> kobo ----

/** Kobo to the decimal text Cray expects: 5_250_000 becomes "52500.00". */
export function koboToNaira(kobo: number): string {
  if (!Number.isSafeInteger(kobo) || kobo <= 0) {
    fail("Amount must be a positive whole number of kobo");
  }
  const naira = Math.floor(kobo / 100);
  const rest = String(kobo % 100).padStart(2, "0");
  return `${naira}.${rest}`;
}

/**
 * Cray's amount (decimal text or a JSON number) to whole kobo. Throws on
 * anything that is not exact: a non-zero digit past the second decimal, a
 * negative, an exponent form, or a value too big to hold as a safe integer.
 */
export function nairaToKobo(value: string | number): number {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return fail("Cray sent an amount that is not a number");
  }
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (match === null) return fail("Cray sent an amount in an unexpected form");
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (/[^0]/.test(fraction.slice(2))) {
    return fail("Cray sent an amount with more than two decimals");
  }
  const kobo = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  if (!Number.isSafeInteger(kobo)) {
    return fail("Cray sent an amount too large to handle");
  }
  return kobo;
}

// ---- signing ----

function encodeQueryPart(raw: string): string {
  // A "+" in our paths is a literal plus, never a space (the docs sign it as %2B).
  const decoded = decodeURIComponent(raw);
  return encodeURIComponent(decoded).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** The path and sorted, percent-encoded query that go into the signature. */
export function canonicalPathWithQuery(pathWithQuery: string): string {
  const [rawPath, ...queryParts] = pathWithQuery.split("?");
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") || "/" : rawPath;
  const query = queryParts.join("?");
  if (query === "") return path;
  const pairs = query
    .split("&")
    .filter((part) => part !== "")
    .map((part) => {
      const at = part.indexOf("=");
      const key = at === -1 ? part : part.slice(0, at);
      const value = at === -1 ? "" : part.slice(at + 1);
      return [encodeQueryPart(key), encodeQueryPart(value)] as const;
    })
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return `${path}?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

/** `t=<ms>,n=<nonce>,kid=<key id>,v1=<base64 DER signature>` for the X-Signature header. */
export function signatureHeader(input: {
  method: "GET" | "POST";
  pathWithQuery: string;
  body: string;
  privateKeyPem: string;
  keyId: string;
  timestampMs: number;
  nonce: string;
}): string {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  const canonical = [
    input.method,
    canonicalPathWithQuery(input.pathWithQuery),
    String(input.timestampMs),
    input.nonce,
    bodyHash,
  ].join("\n");
  // An env var often holds the PEM on one line with literal "\n".
  const pem = input.privateKeyPem.replace(/\\n/g, "\n");
  const signature = signBytes("sha256", Buffer.from(canonical), {
    key: createPrivateKey(pem),
    dsaEncoding: "der",
  }).toString("base64");
  return `t=${input.timestampMs},n=${input.nonce},kid=${input.keyId},v1=${signature}`;
}

// ---- request ----

type Scope = "collection" | "disbursement";

type CrayBody = {
  status?: unknown;
  success?: unknown;
  code?: unknown;
  message?: unknown;
  data?: unknown;
};

async function request(
  scope: Scope,
  method: "GET" | "POST",
  pathWithQuery: string,
  body?: Record<string, unknown>,
): Promise<CrayBody> {
  const baseUrl = process.env.CRAY_BASE_URL ?? "";
  const apiKey =
    (scope === "collection"
      ? process.env.CRAY_COLLECTION_API_KEY
      : process.env.CRAY_DISBURSEMENT_API_KEY) ?? "";
  const privateKeyPem = process.env.CRAY_SIGNING_PRIVATE_KEY ?? "";
  const keyId = process.env.CRAY_SIGNING_KEY_ID ?? "";
  if (baseUrl === "" || apiKey === "" || privateKeyPem === "" || keyId === "") {
    fail("Cray is not configured");
  }

  // Serialise once: the hash and the bytes sent must be the same string.
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  let signature: string;
  try {
    signature = signatureHeader({
      method,
      pathWithQuery,
      body: bodyText,
      privateKeyPem,
      keyId,
      timestampMs: Date.now(),
      nonce: randomUUID(),
    });
  } catch {
    return fail("Could not sign the Cray request");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}${pathWithQuery}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Signature": signature,
      },
      body: body === undefined ? undefined : bodyText,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The underlying error can echo the URL, keys or account numbers, so say nothing of it.
    return fail("Could not reach Cray");
  }

  // A dropped connection or timeout while reading the body leaves the outcome
  // unknown (status 0), which is not the same as an unreadable answer.
  let text: string;
  try {
    text = await response.text();
  } catch {
    return fail("Could not read Cray's response");
  }

  let parsed: CrayBody | null = null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null) {
      parsed = value as CrayBody;
    }
  } catch {
    parsed = null;
  }

  const message =
    typeof parsed?.message === "string" && parsed.message !== ""
      ? parsed.message
      : null;
  const code =
    typeof parsed?.code === "string" && parsed.code !== "" ? parsed.code : null;
  if (!response.ok) {
    return fail(message ?? "Cray returned an error", response.status, code);
  }
  if (parsed === null) {
    return fail("Cray returned an unreadable response", response.status);
  }
  const succeeded =
    parsed.status === true ||
    parsed.status === "success" ||
    parsed.success === true;
  if (!succeeded) {
    return fail(message ?? "Cray refused the request", response.status, code);
  }
  return parsed;
}

export { request as __request };
