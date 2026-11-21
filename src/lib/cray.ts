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
  createHmac,
  createPrivateKey,
  randomUUID,
  sign as signBytes,
  timingSafeEqual,
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
  const kobo =
    Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
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
  const path =
    rawPath.length > 1 ? rawPath.replace(/\/+$/, "") || "/" : rawPath;
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
    .sort((a, b) =>
      a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1,
    );
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

// ---- reading answers ----

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fail("Cray returned an unexpected response");
}

function requireString(value: unknown): string {
  if (typeof value === "string" && value !== "") return value;
  return fail("Cray returned an unexpected response");
}

function requireAmountKobo(amountKobo: number): void {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    fail("Amount must be a positive whole number of kobo");
  }
}

function requireAmountField(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return fail("Cray returned an unexpected response");
  }
  return nairaToKobo(value);
}

// Letters, digits and _ . = - only: references and Cray ids go into URL paths.
function requireReference(reference: string): void {
  if (!/^[A-Za-z0-9_.=-]{1,100}$/.test(reference) || /^\.+$/.test(reference)) {
    fail("Invalid reference");
  }
}

function requireAccountNumber(accountNumber: string): void {
  if (!/^\d{10}$/.test(accountNumber)) fail("Invalid account number");
}

// ---- hosted card checkout ----

export async function initializeCheckout(input: {
  amountKobo: number;
  reference: string;
  email: string;
  name: string;
  callbackUrl: string;
}): Promise<{ checkoutUrl: string }> {
  requireAmountKobo(input.amountKobo);
  requireReference(input.reference);
  const result = await request("collection", "POST", "/checkout/initialize", {
    amount: koboToNaira(input.amountKobo),
    currency: "NGN",
    reference: input.reference,
    defaultPaymentMethod: "card",
    paymentMethods: ["card"],
    // Cray adds its card charge to what the business pays, so we never carry it.
    feeBearer: "customer",
    token: process.env.CRAY_SUBACCOUNT_TOKEN ?? "",
    customer: { name: input.name, email: input.email },
    callback_url: input.callbackUrl,
  });
  return { checkoutUrl: requireString(asObject(result.data).link) };
}

export type CheckoutQuery = {
  status: "success" | "failed" | "abandoned" | "pending";
  reference: string;
  /** What the business paid, Cray's charge included. */
  grossKobo: number;
  feeKobo: number;
  /** What reaches us. */
  netKobo: number;
  currency: string | null;
  /** Cray's data object as received; trim it before storing. */
  raw: unknown;
};

// Which field is which is a "verify in sandbox" item (spec §5.2); this is the
// one place that reads them.
function checkoutStatus(text: unknown): CheckoutQuery["status"] {
  switch (typeof text === "string" ? text.toLowerCase() : "") {
    case "successful":
      return "success";
    case "failed":
      return "failed";
    case "abandoned":
      return "abandoned";
    default:
      return "pending";
  }
}

export async function queryCheckout(reference: string): Promise<CheckoutQuery> {
  requireReference(reference);
  const result = await request(
    "collection",
    "GET",
    `/checkout/query/${encodeURIComponent(reference)}`,
  );
  const data = asObject(result.data);
  // Never apply an answer about some other payment.
  if (data.reference !== reference) {
    fail("Cray answered for a different payment");
  }
  const status = checkoutStatus(data.status);
  const currency =
    typeof data.currency === "string" && data.currency !== ""
      ? data.currency
      : null;
  if (status !== "success") {
    return {
      status,
      reference,
      grossKobo: 0,
      feeKobo: 0,
      netKobo: 0,
      currency,
      raw: data,
    };
  }
  return {
    status,
    reference,
    grossKobo: requireAmountField(data.amount),
    feeKobo: requireAmountField(data.fee ?? data.charge),
    netKobo: requireAmountField(data.net_amount),
    currency,
    raw: data,
  };
}

// ---- permanent transfer accounts ----

export async function createPermanentAccount(input: {
  reference: string;
  accountName: string;
  email: string;
}): Promise<{
  providerAccountId: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
}> {
  requireReference(input.reference);
  // No BVN is sent (spec §5.3, "BVN - open"); the sandbox will say if one is needed.
  const result = await request(
    "collection",
    "POST",
    "/virtual-accounts/create",
    {
      type: "individual",
      virtual_account_type: "Permanent",
      currency: "NGN",
      provider: "Bloc",
      account_name: input.accountName,
      customer_email: input.email,
      reference: input.reference,
    },
  );
  const data = asObject(result.data);
  const accountNumber = requireString(data.account_number);
  requireAccountNumber(accountNumber);
  return {
    providerAccountId: requireString(data.id ?? data.reference),
    accountNumber,
    bankName: requireString(data.bank_name),
    accountName: requireString(data.account_name),
  };
}

// ---- payouts ----

export async function listBanks(): Promise<{ code: string; name: string }[]> {
  const result = await request("disbursement", "GET", "/payout/banks");
  const data: unknown = result.data;
  const list = Array.isArray(data) ? data : asObject(data).banks;
  if (!Array.isArray(list)) return fail("Cray returned an unexpected response");
  const seen = new Set<string>();
  const banks: { code: string; name: string }[] = [];
  for (const entry of list) {
    const bank = asObject(entry);
    const code = bank.bank_code;
    const name = bank.bank_name;
    if (typeof code !== "string" || code === "") continue;
    if (typeof name !== "string" || name === "") continue;
    if (seen.has(code)) continue;
    seen.add(code);
    banks.push({ code, name });
  }
  return banks;
}

export async function validateAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string; refId: string }> {
  requireAccountNumber(accountNumber);
  if (bankCode.trim() === "") fail("Invalid bank code");
  const result = await request(
    "disbursement",
    "POST",
    "/payout/accounts/validate",
    {
      account_number: accountNumber,
      bank_code: bankCode,
    },
  );
  const data = asObject(result.data);
  return {
    accountName: requireString(data.account_name),
    refId: requireString(data.ref_id),
  };
}

export async function disburse(input: {
  amountKobo: number;
  reference: string;
  accountNumber: string;
  bankCode: string;
  recipientName: string;
  refId: string;
  narration: string;
}): Promise<{ providerReference: string; status: string }> {
  requireAmountKobo(input.amountKobo);
  requireReference(input.reference);
  requireAccountNumber(input.accountNumber);
  try {
    const result = await request("disbursement", "POST", "/payout/disburse", {
      customer_reference: input.reference,
      amount: koboToNaira(input.amountKobo),
      currency: "NGN",
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      recipient_name: input.recipientName,
      ref_id: input.refId,
      narration: input.narration,
    });
    const data = asObject(result.data);
    return {
      providerReference: requireString(data.reference),
      status: typeof data.status === "string" ? data.status : "pending",
    };
  } catch (error) {
    if (error instanceof CrayError && error.status === 400) {
      // A refused disburse sent nothing, but the two refusals mean different things to the caller.
      if (/insufficient balance/i.test(error.message)) {
        throw new CrayError(
          error.message,
          error.status,
          "insufficient_balance",
        );
      }
      if (/duplicate|already (been )?used|exists/i.test(error.message)) {
        throw new CrayError(error.message, error.status, "duplicate_reference");
      }
    }
    throw error;
  }
}

export type PayoutQuery = {
  status: "success" | "failed" | "reversed" | "pending";
  merchantReference: string | null;
  /** The amount Cray sent to the bank (what we asked it to disburse). */
  sentKobo: number;
  /** Cray's charge, when it says so. */
  chargeKobo: number | null;
  raw: unknown;
};

const loggedPayoutStatuses = new Set<string>();

// The vocabulary is a "verify in sandbox" item (spec §5.4): unknown strings are
// pending, never failed, and logged once.
function payoutStatus(text: unknown): PayoutQuery["status"] {
  const value = typeof text === "string" ? text.toLowerCase() : "";
  switch (value) {
    case "approved":
    case "successful":
    case "success":
      return "success";
    case "failed":
    case "declined":
      return "failed";
    case "reversed":
      return "reversed";
    case "pending":
      return "pending";
    default:
      if (!loggedPayoutStatuses.has(value)) {
        loggedPayoutStatuses.add(value);
        console.error("cray payout status unknown", value);
      }
      return "pending";
  }
}

export async function requeryPayout(
  providerReference: string,
): Promise<PayoutQuery> {
  requireReference(providerReference);
  const result = await request(
    "disbursement",
    "GET",
    `/payout/requery/${encodeURIComponent(providerReference)}`,
  );
  const data = asObject(result.data);
  const status = payoutStatus(data.status);
  const hasAmount = data.amount !== undefined && data.amount !== null;
  // A paid or reversed payout without an amount can't be booked.
  if (!hasAmount && (status === "success" || status === "reversed")) {
    fail("Cray returned a payout without an amount");
  }
  const charge = data.charge ?? data.fee;
  return {
    status,
    merchantReference:
      typeof data.merchant_reference === "string" &&
      data.merchant_reference !== ""
        ? data.merchant_reference
        : null,
    sentKobo: hasAmount ? requireAmountField(data.amount) : 0,
    chargeKobo:
      charge === undefined || charge === null
        ? null
        : requireAmountField(charge),
    raw: data,
  };
}

// ---- balance ----

function accountKobo(account: Record<string, unknown>): number {
  if (account.actual_balance !== undefined && account.actual_balance !== null) {
    return requireAmountField(account.actual_balance);
  }
  const available = requireAmountField(account.available_balance ?? 0);
  const locked = requireAmountField(account.locked_balance ?? 0);
  return available + locked;
}

/** Cray holds a Main Balance (payouts draw on it) and a Settlement Balance; both count as our cash. */
export async function getBalances(): Promise<{
  totalKobo: number;
  parts: { name: string; kobo: number }[];
}> {
  const result = await request("collection", "GET", "/balance?currency=NGN");
  const data: unknown = result.data;
  const list = Array.isArray(data) ? data : asObject(data).accounts;
  if (!Array.isArray(list)) return fail("Cray returned an unexpected response");
  const parts: { name: string; kobo: number }[] = [];
  for (const entry of list) {
    const account = asObject(entry);
    if (typeof account.currency === "string" && account.currency !== "NGN") {
      continue;
    }
    parts.push({
      name: typeof account.name === "string" ? account.name : "Balance",
      kobo: accountKobo(account),
    });
  }
  const totalKobo = parts.reduce((sum, part) => sum + part.kobo, 0);
  return { totalKobo, parts };
}

export async function getMainBalanceKobo(): Promise<number | null> {
  const { parts } = await getBalances();
  const main = parts.find((part) => /main/i.test(part.name));
  return main === undefined ? null : main.kobo;
}

// ---- webhook hash ----

// Cray signs its own serialisation of `data`. Node's JSON.stringify is what its
// docs tell Node users to use; the PHP-style variant (escaped slashes and
// \uXXXX for non-ASCII) is tried too until the sandbox shows which one it is.
function phpStyleJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/\//g, "\\/")
    .replace(
      /[\u0080-\uffff]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
}

function sameBase64(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on different lengths.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Checks a `collection.*` webhook: base64(HMAC-SHA256(data, webhook key)).
 * `keyHint` is the last four characters of the key named in Cray-Webhook-Key;
 * with a hint only a matching key is tried, without one each key is.
 */
export function isValidWebhookHash(
  data: unknown,
  hash: unknown,
  keyHint: string | null,
): boolean {
  if (typeof hash !== "string" || hash === "") return false;
  const keys = (process.env.CRAY_WEBHOOK_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key !== "")
    .slice(0, 2);
  const candidates =
    keyHint === null || keyHint === ""
      ? keys
      : keys.filter((key) => key.endsWith(keyHint));
  if (candidates.length === 0) return false;

  let serialisations: string[];
  try {
    serialisations = [JSON.stringify(data), phpStyleJson(data)];
  } catch {
    return false;
  }
  for (const key of candidates) {
    for (const text of serialisations) {
      const expected = createHmac("sha256", key).update(text).digest("base64");
      if (sameBase64(hash, expected)) return true;
    }
  }
  return false;
}
