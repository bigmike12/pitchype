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

import { normaliseName, personNamesMatch } from "./identity-names.ts";

export type IdentityKind =
  "creator_nin" | "owner_bvn" | "business_cac" | "director_bvn";

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
  idType: "NIN" | "BVN" | null;
  idNumber: string | null;
  nameOnRecord: string | null;
  dateOfBirth: string | null;
  detail: string | null;
};

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function step(event: Json, name: string): Json | null {
  const value = asObject(event.data)[name];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

/**
 * True only when the step is present and Dojah marked it passed. The step keys
 * ("government_data", "selfie") and the boolean `status` come from Dojah's
 * sample; verify them against a sandbox session.
 */
export function stepPassed(event: Json, name: string): boolean {
  return step(event, name)?.status === true;
}

function stepFailed(event: Json, name: string): boolean {
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

function selfieReason(event: Json): FailureReason {
  const message = str(step(event, "selfie")?.message) ?? "";
  return /live/i.test(message) && !/success/i.test(message)
    ? "liveness_failed"
    : "selfie_mismatch";
}

/** The reason for the first step that failed, or `other` when none did. */
function failingStepReason(event: Json): FailureReason {
  if (stepFailed(event, "government_data")) return "id_not_found";
  if (stepFailed(event, "selfie")) return selfieReason(event);
  return "other";
}

function failingStepDetail(event: Json): string | null {
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

/** The government record for the ID type: data.government_data.data.<nin|bvn>.entity. */
function governmentEntity(event: Json, idType: "NIN" | "BVN"): Json {
  const record = asObject(
    asObject(
      asObject(step(event, "government_data")?.data)[idType.toLowerCase()],
    ),
  );
  return asObject(record.entity);
}

function idNumberOf(
  event: Json,
  idType: "NIN" | "BVN",
  entity: Json,
): string | null {
  for (const candidate of [event.value, entity[idType.toLowerCase()]]) {
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

function recordName(entity: Json): string | null {
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

  const wanted = check.kind === "creator_nin" ? "NIN" : "BVN";
  const idType = str(e.id_type)?.toUpperCase();
  if (check.kind === "business_cac" || idType !== wanted) {
    return failed("other", "The ID type does not fit this check");
  }

  const entity = governmentEntity(e, wanted);
  const idNumber = idNumberOf(e, wanted, entity);
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
    idType: wanted,
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
