// The Dojah boundary (CLAUDE.md §2a): the only file that talks to Dojah's API.
// Plain functions over fetch, like paystack.ts and cray.ts, with no retries:
// callers (the webhook, the daily job) try again on their own schedule.
//
// Dojah's auth header is the secret key as-is, with no "Bearer", plus AppId.
// The hosted widget (people's NIN/BVN and selfie) runs in the browser against
// Dojah directly; what we call from the server is the CAC lookup, the
// verification lookup (the webhook's backstop) and AML screening.
//
// Errors never carry a key or a long run of digits (an ID number can come back
// echoed in an error body). No `import "server-only"`: node tests cannot
// resolve it. None of these variables has a NEXT_PUBLIC_ prefix, so Next never
// bundles them; the page passes widgetConfig()'s public values as props.

import { createHmac, timingSafeEqual } from "node:crypto";

import { normaliseName } from "./identity-names.ts";

const TIMEOUT_MS = 15_000;

export type CompanyType =
  | "BUSINESS_NAME"
  | "COMPANY"
  | "INCORPORATED_TRUSTEES"
  | "LIMITED_PARTNERSHIP"
  | "LIMITED_LIABILITY_PARTNERSHIP";

/** `status` is the HTTP status, or 0 when no answer came back. */
export class DojahError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DojahError";
    this.status = status;
  }
}

const SECRET_NAMES = [
  "DOJAH_SECRET_KEY",
  "DOJAH_PUBLIC_KEY",
  "DOJAH_WEBHOOK_SECRET",
] as const;

/** Strips Dojah's keys and masks any run of 9 or more digits. */
function safeMessage(message: string): string {
  let result = message;
  for (const name of SECRET_NAMES) {
    const secret = process.env[name] ?? "";
    if (secret !== "") result = result.split(secret).join("[key]");
  }
  return result.replace(/\d{9,}/g, "[masked]");
}

function fail(message: string, status = 0): never {
  throw new DojahError(safeMessage(message), status);
}

const ALL_ENV = [
  "DOJAH_BASE_URL",
  "DOJAH_APP_ID",
  "DOJAH_SECRET_KEY",
  "DOJAH_PUBLIC_KEY",
  "DOJAH_WEBHOOK_SECRET",
  "DOJAH_WIDGET_ID_NIN",
  "DOJAH_WIDGET_ID_BVN",
  "IDENTITY_FINGERPRINT_KEY",
] as const;

/** True when every variable an identity check needs is set. */
export function isDojahConfigured(): boolean {
  return ALL_ENV.every((name) => (process.env[name] ?? "") !== "");
}

/** Hex HMAC-SHA256 of the raw body with the subscription's webhook secret. */
export function isValidDojahSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.DOJAH_WEBHOOK_SECRET ?? "";
  if (secret === "" || signature === null || signature === "") return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(rawBody).digest("hex"),
  );
  const given = Buffer.from(signature.trim().toLowerCase());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The values the browser widget needs. Server-only function: the page decides when to expose them. */
export function widgetConfig(kind: "NIN" | "BVN"): {
  appId: string;
  publicKey: string;
  widgetId: string;
} {
  const appId = process.env.DOJAH_APP_ID ?? "";
  const publicKey = process.env.DOJAH_PUBLIC_KEY ?? "";
  const widgetId =
    (kind === "NIN"
      ? process.env.DOJAH_WIDGET_ID_NIN
      : process.env.DOJAH_WIDGET_ID_BVN) ?? "";
  if (appId === "" || publicKey === "" || widgetId === "") {
    fail("Dojah is not configured");
  }
  return { appId, publicKey, widgetId };
}

async function request(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const base = (process.env.DOJAH_BASE_URL ?? "").replace(/\/+$/, "");
  const secret = process.env.DOJAH_SECRET_KEY ?? "";
  const appId = process.env.DOJAH_APP_ID ?? "";
  if (base === "" || secret === "" || appId === "") {
    fail("Dojah is not configured");
  }
  const headers: Record<string, string> = {
    Authorization: secret,
    AppId: appId,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    fail(
      `Dojah did not answer: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

function describe(status: number, json: unknown): string {
  const text =
    json && typeof json === "object" && "error" in json
      ? String((json as { error: unknown }).error)
      : "";
  return `Dojah answered ${status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export type CacResult =
  | {
      found: true;
      companyName: string;
      companyType: string;
      status: string | null;
      registrationNumber: string;
      directors: string[];
    }
  | { found: false };

/**
 * The advanced CAC lookup: the company and its affiliates (directors,
 * proprietors) in one call. 404 means no such company. The status text is not
 * in Dojah's sample, so it stays null when absent (verify in sandbox).
 */
export async function lookupCacAdvanced(
  rcNumber: string,
  companyType: CompanyType,
): Promise<CacResult> {
  const query = new URLSearchParams({
    rc_number: rcNumber,
    company_type: companyType,
  });
  const { status, json } = await request(
    "GET",
    `/api/v1/kyc/cac/advance?${query.toString()}`,
  );
  if (status === 404) return { found: false };
  if (status < 200 || status >= 300) fail(describe(status, json), status);

  const entity = asObject(asObject(json).entity);
  const companyName = text(entity.company_name);
  if (companyName === null) return { found: false };
  const affiliates = Array.isArray(entity.affiliates) ? entity.affiliates : [];
  const directors = affiliates
    .map((affiliate) => {
      const a = asObject(affiliate);
      return normaliseName(
        `${text(a.first_name) ?? ""} ${text(a.last_name) ?? ""}`,
      );
    })
    .filter((name) => name !== "");
  return {
    found: true,
    companyName,
    companyType: text(entity.type_of_company) ?? companyType,
    status: text(entity.status) ?? text(entity.status_text),
    registrationNumber: text(entity.rc_number) ?? rcNumber,
    directors,
  };
}

/**
 * The session as Dojah has it, in the same shape the webhook carries. Null when
 * Dojah has no such reference. The lookup wraps the session in `entity` (seen
 * in sandbox 2026-11-25) and the webhook does not, so it is unwrapped here.
 */
export async function getVerification(
  referenceId: string,
): Promise<unknown | null> {
  const query = new URLSearchParams({ reference_id: referenceId });
  const { status, json } = await request(
    "GET",
    `/api/v1/kyc/verification?${query.toString()}`,
  );
  if (status === 404) return null;
  if (status < 200 || status >= 300) fail(describe(status, json), status);
  const entity = asObject(json).entity;
  return entity && typeof entity === "object" ? entity : json;
}

export type ScreeningResult = {
  matchCount: number;
  providerReference: string | null;
};

async function screen(
  schema: "individual" | "organization",
  properties: Record<string, string>,
  reference: string,
): Promise<ScreeningResult> {
  const { status, json } = await request("POST", "/api/v2/aml/screening", {
    schema,
    unique_reference: reference,
    properties,
    screening_options: {
      pep_check: true,
      sanction: true,
      adverse_media_check: false,
    },
  });
  if (status < 200 || status >= 300) fail(describe(status, json), status);
  const entity = asObject(asObject(json).entity);
  return {
    matchCount: Array.isArray(entity.results) ? entity.results.length : 0,
    providerReference: text(entity.entity_id),
  };
}

/** YYYY-MM-DD to the DD-MM-YYYY Dojah wants. */
function dojahDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

/** PEP and sanctions only; adverse media is off to save cost and noise. */
export function screenPerson(input: {
  name: string;
  dateOfBirth: string | null;
  reference: string;
}): Promise<ScreeningResult> {
  const properties: Record<string, string> = { names: input.name };
  if (input.dateOfBirth !== null) {
    properties.date_of_birth = dojahDate(input.dateOfBirth);
  }
  properties.nationality = "Nigerian";
  properties.id_number = "";
  return screen("individual", properties, input.reference);
}

export function screenBusiness(input: {
  name: string;
  reference: string;
}): Promise<ScreeningResult> {
  return screen(
    "organization",
    { names: input.name, nationality: "Nigerian", id_number: "" },
    input.reference,
  );
}
