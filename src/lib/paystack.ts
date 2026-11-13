// The Paystack boundary (CLAUDE.md §2a): the only file that talks to Paystack.
// Plain functions over fetch. Every amount is integer kobo, which is what
// Paystack uses too, so nothing is converted here. No retries: callers use
// idempotent references and try again themselves.
//
// No `import "server-only"`: node tests cannot resolve it. PAYSTACK_SECRET_KEY
// has no NEXT_PUBLIC_ prefix, so Next never bundles it into client code.

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 15_000;
// Nigerian banks number more than 100, so listBanks follows the cursor.
const MAX_BANK_PAGES = 5;

/** `status` is the HTTP status, or 0 when no answer came back (network, timeout, bad input). */
export class PaystackError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
  }
}

function secretKey(): string {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

/** Strips the secret key and masks long digit runs (account numbers) to the last four. */
function safeMessage(message: string): string {
  const key = secretKey();
  const withoutKey = key === "" ? message : message.split(key).join("[key]");
  return withoutKey.replace(/\d{10,}/g, (digits) => `******${digits.slice(-4)}`);
}

function fail(message: string, status = 0): never {
  throw new PaystackError(safeMessage(message), status);
}

/** HMAC SHA-512 of the raw body, checked before the body is parsed (§6 rule 5). */
export function isValidSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const key = secretKey();
  if (key === "" || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const given = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on different lengths.
  if (given.length !== wanted.length) return false;
  return timingSafeEqual(given, wanted);
}

type PaystackBody = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
  meta?: unknown;
};

async function request(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<PaystackBody> {
  const key = secretKey();
  if (key === "") fail("PAYSTACK_SECRET_KEY is not set");

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The underlying error can echo the URL (account numbers), so say nothing of it.
    return fail("Could not reach Paystack");
  }

  let parsed: PaystackBody | null = null;
  try {
    const value: unknown = JSON.parse(await response.text());
    if (typeof value === "object" && value !== null) {
      parsed = value as PaystackBody;
    }
  } catch {
    parsed = null;
  }

  const message =
    typeof parsed?.message === "string" && parsed.message !== ""
      ? parsed.message
      : null;
  if (!response.ok) {
    return fail(message ?? "Paystack returned an error", response.status);
  }
  if (parsed === null) {
    return fail("Paystack returned an unreadable response", response.status);
  }
  if (parsed.status !== true) {
    return fail(message ?? "Paystack refused the request", response.status);
  }
  return parsed;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fail("Paystack returned an unexpected response");
}

function requireString(value: unknown): string {
  if (typeof value === "string" && value !== "") return value;
  return fail("Paystack returned an unexpected response");
}

function requireAmountKobo(amountKobo: number): void {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    fail("Amount must be a positive whole number of kobo");
  }
}

// Letters, digits and _ . = - only: our references are built from these, and
// a stray "/" or "?" must never reach a URL path.
function requireReference(reference: string): void {
  if (!/^[A-Za-z0-9_.=-]{1,100}$/.test(reference)) {
    fail("Invalid payment reference");
  }
}

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}): Promise<{ authorizationUrl: string }> {
  requireAmountKobo(input.amountKobo);
  requireReference(input.reference);
  const result = await request("POST", "/transaction/initialize", {
    email: input.email,
    amount: input.amountKobo,
    reference: input.reference,
    callback_url: input.callbackUrl,
    currency: "NGN",
  });
  return {
    authorizationUrl: requireString(asObject(result.data).authorization_url),
  };
}

export async function verifyTransaction(reference: string): Promise<{
  status: "success" | "failed" | "abandoned" | "pending";
  amountKobo: number;
  feesKobo: number;
  currency: string;
  raw: unknown;
}> {
  requireReference(reference);
  const result = await request(
    "GET",
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  const data = asObject(result.data);

  const status =
    data.status === "success" ||
    data.status === "failed" ||
    data.status === "abandoned"
      ? data.status
      : "pending";
  if (typeof data.amount !== "number") {
    fail("Paystack did not return the amount");
  }
  const fees = typeof data.fees === "number" ? data.fees : null;
  // The fee decides the refund maths later, so a payment is never recorded
  // with a made-up zero: the caller tries again when Paystack has the figure.
  if (status === "success" && fees === null) {
    fail("Paystack did not return the fee for a successful payment");
  }
  return {
    status,
    amountKobo: data.amount,
    feesKobo: fees ?? 0,
    currency: typeof data.currency === "string" ? data.currency : "",
    raw: data,
  };
}

/**
 * Walks Paystack's cursor, at most five pages of 100. Paystack lists a few
 * codes twice; the first is kept so a bank picker keyed by code stays unique.
 */
export async function listBanks(): Promise<{ code: string; name: string }[]> {
  const banks: { code: string; name: string }[] = [];
  let next: string | null = null;
  for (let page = 0; page < MAX_BANK_PAGES; page += 1) {
    const query = new URLSearchParams({
      country: "nigeria",
      currency: "NGN",
      perPage: "100",
    });
    if (next !== null) query.set("next", next);
    const result = await request("GET", `/bank?${query.toString()}`);
    if (!Array.isArray(result.data)) fail("Paystack returned an unexpected response");
    for (const entry of result.data) {
      const bank = asObject(entry);
      const code = requireString(bank.code);
      if (banks.some((known) => known.code === code)) continue;
      banks.push({ code, name: requireString(bank.name) });
    }
    const cursor =
      typeof result.meta === "object" && result.meta !== null
        ? (result.meta as { next?: unknown }).next
        : null;
    if (typeof cursor !== "string" || cursor === "") break;
    next = cursor;
  }
  return banks;
}

function requireBankDetails(accountNumber: string, bankCode: string): void {
  if (!/^\d{10}$/.test(accountNumber) || !/^[A-Za-z0-9]{3,6}$/.test(bankCode)) {
    fail("invalid_account");
  }
}

export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string }> {
  requireBankDetails(accountNumber, bankCode);
  const query = new URLSearchParams({
    account_number: accountNumber,
    bank_code: bankCode,
  });
  const result = await request("GET", `/bank/resolve?${query.toString()}`);
  return { accountName: requireString(asObject(result.data).account_name) };
}

export async function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<{ recipientCode: string }> {
  requireBankDetails(input.accountNumber, input.bankCode);
  const result = await request("POST", "/transferrecipient", {
    type: "nuban",
    name: input.name,
    account_number: input.accountNumber,
    bank_code: input.bankCode,
    currency: "NGN",
  });
  return { recipientCode: requireString(asObject(result.data).recipient_code) };
}

export async function initiateTransfer(input: {
  amountKobo: number;
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<{ transferCode: string }> {
  requireAmountKobo(input.amountKobo);
  requireReference(input.reference);
  const result = await request("POST", "/transfer", {
    source: "balance",
    amount: input.amountKobo,
    recipient: input.recipientCode,
    reference: input.reference,
    reason: input.reason,
  });
  return { transferCode: requireString(asObject(result.data).transfer_code) };
}

export async function verifyTransfer(reference: string): Promise<{
  status: "success" | "failed" | "reversed" | "pending" | "not_found";
  raw: unknown;
}> {
  requireReference(reference);
  let result: PaystackBody;
  try {
    result = await request(
      "GET",
      `/transfer/verify/${encodeURIComponent(reference)}`,
    );
  } catch (error) {
    // Not an error: the transfer was never created (e.g. we crashed before sending it).
    if (
      error instanceof PaystackError &&
      (error.status === 404 || /transfer not found/i.test(error.message))
    ) {
      return { status: "not_found", raw: null };
    }
    throw error;
  }
  const data = asObject(result.data);
  const status =
    data.status === "success" ||
    data.status === "failed" ||
    data.status === "reversed"
      ? data.status
      : "pending"; // otp, pending, processing, received, queued
  return { status, raw: data };
}

/** The NGN balance in our Paystack account, in kobo. */
export async function getBalanceKobo(): Promise<number> {
  const result = await request("GET", "/balance");
  if (!Array.isArray(result.data)) fail("Paystack returned an unexpected response");
  for (const entry of result.data) {
    const balance = asObject(entry);
    if (balance.currency === "NGN" && typeof balance.balance === "number") {
      return balance.balance;
    }
  }
  return fail("Paystack returned no NGN balance");
}
