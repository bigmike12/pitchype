// What a Dojah hosted-flow session means (design §5.2 step 4, §5.5). Pure
// functions: the webhook, the daily backstop and the tests all go through
// decideIdentityResult, so one place decides "verified".
//
// "Completed" from Dojah means finished, not passed: a session is verified
// only when its overall status and the steps we need all passed and the name
// on the government record matches what the person typed.
//
// Nothing here logs. The ID number leaves decideIdentityResult in `idNumber`
// for the caller to fingerprint and drop; it is never part of a trimmed copy.

import type { CacResult, CompanyType } from "./dojah.ts";
import { isValidDojahSignature } from "./dojah.ts";
import type {
  BusinessCacFacts,
  FinishResult,
  IdentityCheckForEvent,
} from "./db/identity.ts";
import { lastThree } from "./identity-crypto.ts";
import {
  companyNamesMatch,
  normaliseName,
  personNamesMatch,
} from "./identity-names.ts";

export type IdentityKind =
  "creator_nin" | "owner_nin" | "business_cac" | "director_nin";

export type FailureReason =
  | "name_mismatch"
  | "selfie_mismatch"
  | "id_not_found"
  | "liveness_failed"
  | "provider_unavailable"
  | "duplicate_identity"
  | "company_not_found"
  | "company_inactive"
  | "not_a_director"
  | "abandoned"
  | "other";

export type IdentityDecision = {
  status: "ongoing" | "pending" | "verified" | "failed" | "abandoned";
  reason: FailureReason | null;
  idType: "NIN" | null;
  idNumber: string | null;
  nameOnRecord: string | null;
  dateOfBirth: string | null;
  detail: string | null;
};

type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function step(event: Obj, name: string): Obj | null {
  const value = asObject(event.data)[name];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : null;
}

/**
 * True only when the step is present and Dojah marked it passed. The step keys
 * ("government_data", "selfie") and the boolean `status` come from Dojah's
 * sample; verify them against a sandbox session.
 */
export function stepPassed(event: Obj, name: string): boolean {
  return step(event, name)?.status === true;
}

function stepFailed(event: Obj, name: string): boolean {
  return step(event, name)?.status === false;
}

/** Digits are never kept in a stored message. */
function scrub(message: string | null): string | null {
  if (message === null) return null;
  return message
    .replace(/https?:\S+/g, "[link]")
    .replace(/\d+/g, "#")
    .slice(0, 200);
}

function selfieReason(event: Obj): FailureReason {
  const message = str(step(event, "selfie")?.message) ?? "";
  return /live/i.test(message) && !/success/i.test(message)
    ? "liveness_failed"
    : "selfie_mismatch";
}

/**
 * The reason for the first step that failed. When none is marked failed, the
 * top-level message: a failed liveness drops the selfie step and says only
 * "Liveness Verification Error" there (seen in sandbox 2026-11-25).
 */
function failingStepReason(event: Obj): FailureReason {
  if (stepFailed(event, "government_data")) return "id_not_found";
  if (stepFailed(event, "selfie")) return selfieReason(event);
  if (/liveness/i.test(str(event.message) ?? "")) return "liveness_failed";
  return "other";
}

function failingStepDetail(event: Obj): string | null {
  for (const name of ["government_data", "selfie"]) {
    if (stepFailed(event, name)) return scrub(str(step(event, name)?.message));
  }
  return scrub(str(event.message));
}

function failed(
  reason: FailureReason,
  detail: string | null,
): IdentityDecision {
  return {
    status: "failed",
    reason,
    idType: null,
    idNumber: null,
    nameOnRecord: null,
    dateOfBirth: null,
    detail,
  };
}

function simple(status: IdentityDecision["status"]): IdentityDecision {
  return {
    status,
    reason: status === "abandoned" ? "abandoned" : null,
    idType: null,
    idNumber: null,
    nameOnRecord: null,
    dateOfBirth: null,
    detail: null,
  };
}

/** The NIN record: data.government_data.data.nin.entity. */
function governmentEntity(event: Obj): Obj {
  const record = asObject(
    asObject(asObject(step(event, "government_data")?.data).nin),
  );
  return asObject(record.entity);
}

function idNumberOf(event: Obj, entity: Obj): string | null {
  for (const candidate of [event.value, entity.nin]) {
    const digits = typeof candidate === "string" ? candidate.trim() : "";
    if (/^\d{11}$/.test(digits)) return digits;
  }
  return null;
}

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/** YYYY-MM-DD, DD-MM-YYYY or DD-Mon-YYYY to an ISO date; anything else is null. */
function isoDate(value: unknown): string | null {
  const text = str(value);
  if (text === null) return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{4})$/.exec(text);
  if (match && MONTHS[match[2].toUpperCase()]) {
    return `${match[3]}-${MONTHS[match[2].toUpperCase()]}-${match[1].padStart(2, "0")}`;
  }
  return null;
}

function recordName(entity: Obj): string | null {
  const first = str(entity.first_name) ?? str(entity.firstname);
  const last = str(entity.last_name) ?? str(entity.surname);
  if (first === null || last === null) return null;
  const middle = str(entity.middle_name) ?? str(entity.middlename) ?? "";
  return normaliseName(`${first} ${middle} ${last}`);
}

export function decideIdentityResult(
  event: unknown,
  check: { kind: IdentityKind; legalNameEntered: string },
): IdentityDecision {
  const e = asObject(event);
  switch (str(e.verification_status)) {
    case "Ongoing":
      return simple("ongoing");
    case "Pending":
      return simple("pending");
    case "Abandoned":
      return simple("abandoned");
    case "Failed":
      return failed(failingStepReason(e), failingStepDetail(e));
    case "Completed":
      break;
    default:
      return failed("other", null);
  }

  if (e.status !== true)
    return failed(failingStepReason(e), failingStepDetail(e));
  if (!stepPassed(e, "government_data")) {
    return failed(
      stepFailed(e, "government_data") ? "id_not_found" : "other",
      failingStepDetail(e),
    );
  }
  if (!stepPassed(e, "selfie")) {
    return failed(
      stepFailed(e, "selfie") ? selfieReason(e) : "other",
      failingStepDetail(e),
    );
  }

  // Creators, unregistered owners and directors all verify with their NIN.
  const idType = str(e.id_type)?.toUpperCase();
  if (check.kind === "business_cac" || idType !== "NIN") {
    return failed("other", "The ID type does not fit this check");
  }

  const entity = governmentEntity(e);
  const idNumber = idNumberOf(e, entity);
  const nameOnRecord = recordName(entity);
  if (idNumber === null || nameOnRecord === null) {
    return failed("other", "The record had no usable number or name");
  }
  if (!personNamesMatch(check.legalNameEntered, nameOnRecord)) {
    return failed("name_mismatch", null);
  }
  return {
    status: "verified",
    reason: null,
    idType: "NIN",
    idNumber,
    nameOnRecord,
    dateOfBirth: isoDate(entity.date_of_birth),
    detail: null,
  };
}

/**
 * The only copy of a Dojah event we store: Dojah's ids and statuses, each
 * step's status and message. No number, name, date of birth, link or image.
 */
export function trimIdentityEvent(
  event: unknown,
): Record<string, string | number | boolean | null> {
  const e = asObject(event);
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of ["reference_id", "verification_status", "id_type"]) {
    const value = str(e[key]);
    if (value !== null) out[key] = value;
  }
  if (typeof e.status === "boolean") out.status = e.status;
  for (const [name, value] of Object.entries(asObject(e.data))) {
    const s = asObject(value);
    if (typeof s.status !== "boolean") continue;
    out[`${name}_status`] = s.status;
    const message = scrub(str(s.message));
    if (message !== null) out[`${name}_message`] = message;
  }
  return out;
}

/** Inactive when the status text says so; no text counts as active (verify the vocabulary in sandbox). */
export function isCompanyActive(status: string | null): boolean {
  return status === null || !/inactive|struck|dissolved|wound/i.test(status);
}

/**
 * What a CAC lookup means for the name the business typed (design §5.3): the
 * company must exist, be active, and carry the same name on CAC's records.
 * The first thing wrong decides the reason.
 */
export function decideCacResult(
  enteredName: string,
  cac: CacResult,
): { status: "verified" | "failed"; reason: FailureReason | null } {
  if (!cac.found) return { status: "failed", reason: "company_not_found" };
  if (!isCompanyActive(cac.status)) {
    return { status: "failed", reason: "company_inactive" };
  }
  if (!companyNamesMatch(enteredName, cac.companyName)) {
    return { status: "failed", reason: "name_mismatch" };
  }
  return { status: "verified", reason: null };
}

type CacFound = Extract<CacResult, { found: true }>;

/** CAC's answer as kept on a check (24 hours) for a corrected name; null when it is not a usable one. */
export function cacFromCache(value: unknown): CacFound | null {
  const v = asObject(value);
  const companyName = str(v.companyName);
  const registrationNumber = str(v.registrationNumber);
  if (v.found !== true || companyName === null || registrationNumber === null) {
    return null;
  }
  return {
    found: true,
    companyName,
    companyType: str(v.companyType) ?? "",
    status: str(v.status),
    registrationNumber,
    directors: Array.isArray(v.directors)
      ? v.directors.filter((d): d is string => typeof d === "string")
      : [],
  };
}

/**
 * The decision finish_identity_check records for a CAC check. `companyType` is
 * the value the business chose (our enum, so the director list can be fetched
 * again later); `lookedUp` is false when a corrected name was compared with
 * the answer kept from a paid lookup, which does not count as an attempt.
 */
export function buildCacDecision(input: {
  enteredName: string;
  companyType: CompanyType;
  rcNumber: string;
  cac: CacResult;
  lookedUp: boolean;
}): { [key: string]: Json | undefined } {
  const { status, reason } = decideCacResult(input.enteredName, input.cac);
  const decision: { [key: string]: Json | undefined } = {
    status,
    company_type: input.companyType,
    registration_number: input.rcNumber,
    counted: input.lookedUp,
  };
  if (reason !== null) decision.reason = reason;
  if (input.cac.found) {
    decision.company_name_on_record = input.cac.companyName;
    decision.directors = input.cac.directors;
    decision.cac_cache = { ...input.cac };
  }
  return decision;
}

// Applying an event, the webhook and the daily backstop --------------------------------------------------------------
//
// One path decides a Dojah session, whether it arrives by webhook or by the
// daily lookup: applyIdentityEvent. The event key is built from the
// reference and Dojah's own status, so the same session reported twice (or by
// both routes) is one decision: the database stores the key first and answers
// "duplicate" for the second.
//
// The ID number is read from the event, fingerprinted and dropped in this one
// call. Nothing here logs an event, a name or a number; failures are logged
// by class and the first characters of our own reference only.

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type IdentityDeps = {
  getCheck: (reference: string) => Promise<IdentityCheckForEvent | null>;
  finish: (
    reference: string,
    decision: Json,
    eventKey: string,
  ) => Promise<FinishResult>;
  fingerprint: (digits: string) => string;
  getCacFacts: (userId: string) => Promise<BusinessCacFacts | null>;
  refreshDirectors: (userId: string, directors: string[]) => Promise<void>;
  lookupCac: (rcNumber: string, companyType: CompanyType) => Promise<CacResult>;
  getVerification: (reference: string) => Promise<unknown | null>;
  listToPoll: (max: number) => Promise<string[]>;
  abandonStale: () => Promise<number>;
  now: () => Date;
};

// The real dependencies, in one place. The database module is imported lazily
// because it loads the Supabase clients, which node tests cannot.
async function realDeps(): Promise<IdentityDeps> {
  const db = await import("./db/identity.ts");
  const dojah = await import("./dojah.ts");
  const crypto = await import("./identity-crypto.ts");
  return {
    getCheck: db.getIdentityCheckByReference,
    finish: db.finishIdentityCheck,
    fingerprint: crypto.identityFingerprint,
    getCacFacts: db.getBusinessCacFacts,
    refreshDirectors: db.refreshCacDirectors,
    lookupCac: dojah.lookupCacAdvanced,
    getVerification: dojah.getVerification,
    listToPoll: db.listIdentityChecksToPoll,
    abandonStale: db.abandonStaleIdentityChecks,
    now: () => new Date(),
  };
}

const COMPANY_TYPES: CompanyType[] = [
  "BUSINESS_NAME",
  "COMPANY",
  "INCORPORATED_TRUSTEES",
  "LIMITED_PARTNERSHIP",
  "LIMITED_LIABILITY_PARTNERSHIP",
];
const NINETY_DAYS_MS = 90 * 24 * 3_600_000;

/**
 * Is this person one of the company's directors on CAC? The list stored at
 * sign-up is used while it is under 90 days old; otherwise CAC is asked once
 * more and the list refreshed. A lookup that fails throws, so the event is
 * retried rather than recorded as "not a director".
 */
async function isListedDirector(
  userId: string,
  nameOnRecord: string,
  d: IdentityDeps,
): Promise<boolean> {
  const facts = await d.getCacFacts(userId);
  if (facts === null) return false;
  let directors = facts.directors;
  const fetchedAt =
    facts.directorsFetchedAt === null
      ? null
      : new Date(facts.directorsFetchedAt).getTime();
  const stale =
    fetchedAt === null || d.now().getTime() - fetchedAt > NINETY_DAYS_MS;
  const companyType = COMPANY_TYPES.find((t) => t === facts.companyType);
  if (stale && companyType) {
    const answer = await d.lookupCac(facts.registrationNumber, companyType);
    if (answer.found) {
      directors = answer.directors;
      await d.refreshDirectors(userId, directors);
    }
  }
  return directors.some((name) => personNamesMatch(name, nameOnRecord));
}

export type ApplyResult = "applied" | "duplicate" | "ignored" | "unknown";

/**
 * Decides one Dojah session event and records it. Returns "applied" when the
 * database took the decision, "duplicate" for an event key it already has,
 * "ignored" for events that change nothing (Ongoing, a CAC check, a check
 * already decided) and "unknown" for a reference that is not ours.
 */
export async function applyIdentityEvent(
  event: unknown,
  deps?: IdentityDeps,
): Promise<ApplyResult> {
  const d = deps ?? (await realDeps());
  const e = asObject(event);
  const reference = str(e.reference_id);
  const check = reference === null ? null : await d.getCheck(reference);
  if (reference === null || check === null) return "unknown";
  if (check.kind === "business_cac") return "ignored";

  const decision = decideIdentityResult(event, {
    kind: check.kind,
    legalNameEntered: check.legalNameEntered,
  });
  if (decision.status === "ongoing") return "ignored";
  const eventKey = `dojah:${reference}:${str(e.verification_status) ?? "unknown"}`;

  let toRecord: { [key: string]: Json | undefined };
  if (decision.status === "pending") {
    toRecord = { status: "pending", counted: true };
  } else if (decision.status === "abandoned") {
    toRecord = { status: "abandoned", reason: "abandoned", counted: false };
  } else if (decision.status === "failed") {
    toRecord = {
      status: "failed",
      reason: decision.reason ?? "other",
      failure_detail: decision.detail,
      counted: true,
    };
  } else if (
    decision.idType === null ||
    decision.idNumber === null ||
    decision.nameOnRecord === null
  ) {
    // decideIdentityResult never verifies without these; fail closed anyway.
    toRecord = { status: "failed", reason: "other", counted: true };
  } else if (
    check.kind === "director_nin" &&
    !(await isListedDirector(check.userId, decision.nameOnRecord, d))
  ) {
    toRecord = { status: "failed", reason: "not_a_director", counted: true };
  } else {
    toRecord = {
      status: "verified",
      legal_name_on_record: decision.nameOnRecord,
      id_last3: lastThree(decision.idNumber),
      id_fingerprint: d.fingerprint(decision.idNumber),
      date_of_birth: decision.dateOfBirth,
      counted: true,
    };
  }

  const result = await d.finish(reference, toRecord, eventKey);
  if (result === "duplicate") return "duplicate";
  if (result === "ignored" || result === "unknown_reference") {
    return result === "ignored" ? "ignored" : "unknown";
  }
  return "applied";
}

export type DojahWebhookDeps = {
  apply: (event: unknown) => Promise<ApplyResult>;
};

type WebhookResponse = {
  status: number;
  body: { ok: boolean; result?: string };
};

// The references we create (start_identity_check). Anything else is not ours.
const IDENTITY_REFERENCE = /^pit_id_[0-9a-f]{32}$/;

/** The error's class (and status when it has one), nothing else. */
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "NonError";
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? `${name} ${status}` : name;
}

/**
 * Decides what a Dojah webhook means. The signature is checked on the raw
 * body before anything is parsed. 200 tells Dojah to stop, 5xx makes it retry:
 * a database or provider outage is retried, and so is a missing key.
 */
export async function handleDojahWebhook(
  rawBody: string,
  signature: string | null,
  deps: DojahWebhookDeps = { apply: (event) => applyIdentityEvent(event) },
): Promise<WebhookResponse> {
  if (!isValidDojahSignature(rawBody, signature)) {
    return { status: 401, body: { ok: false } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const reference = str(asObject(parsed).reference_id);
  if (reference === null || !IDENTITY_REFERENCE.test(reference)) {
    return { status: 200, body: { ok: true, result: "ignored" } };
  }
  try {
    const result = await deps.apply(parsed);
    return { status: 200, body: { ok: true, result } };
  } catch (error) {
    // Class and the start of our own reference only: never a message, which
    // could carry a number.
    console.error(
      "dojah webhook failed",
      reference.slice(0, 15),
      describeError(error),
    );
    return { status: 500, body: { ok: false } };
  }
}

export type IdentityChecksResult = {
  polled: number;
  applied: number;
  errored: number;
  abandoned: number;
};

const POLL_BATCH = 100;

/**
 * The daily backstop: abandons sessions that never started, deletes expired
 * secrets, and asks Dojah about sessions still open after 30 minutes, treating
 * each answer exactly like a webhook. One failure never stops the rest; the
 * caller answers 500 when `errored` is above zero.
 */
export async function runIdentityChecks(
  now: Date = new Date(),
  deps?: IdentityDeps,
): Promise<IdentityChecksResult> {
  const d = deps ?? { ...(await realDeps()), now: () => now };
  const result: IdentityChecksResult = {
    polled: 0,
    applied: 0,
    errored: 0,
    abandoned: 0,
  };

  try {
    result.abandoned = await d.abandonStale();
  } catch (error) {
    result.errored += 1;
    console.error("identity abandon failed", describeError(error));
  }

  let references: string[] = [];
  try {
    references = await d.listToPoll(POLL_BATCH);
  } catch (error) {
    result.errored += 1;
    console.error("identity poll list failed", describeError(error));
  }
  result.polled = references.length;
  for (const reference of references) {
    try {
      const answer = await d.getVerification(reference);
      if (answer === null) continue;
      // We asked by this reference, so the answer is for it whatever id the
      // lookup echoes back.
      const outcome = await applyIdentityEvent(
        { ...asObject(answer), reference_id: reference },
        d,
      );
      if (outcome === "applied") result.applied += 1;
    } catch (error) {
      result.errored += 1;
      console.error(
        "identity check failed",
        reference.slice(0, 15),
        describeError(error),
      );
    }
  }
  return result;
}

/** HTTP status for the cron response: 500 when any step failed, so the scheduler's log shows it. */
export function identityCronStatus(result: IdentityChecksResult): 200 | 500 {
  return result.errored > 0 ? 500 : 200;
}
