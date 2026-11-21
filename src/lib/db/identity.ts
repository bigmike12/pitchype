// Data access for identity checks and screenings.
//
// Every change goes through a database function (the identity_checks
// migration). Functions a signed-in person or admin may call use the session
// client; the ones that act for no one person (recording a provider's answer,
// the short-lived BVN, the daily housekeeping, facts for a screening) use the
// secret-key client and are service_role-only in SQL. The tables themselves
// are closed to every client role except admin reads; nothing here selects a
// fingerprint or date of birth for a person.

import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { bool, isObject, list, num, obj, str } from "./json";
import { refused, type Refused } from "./refusal";

type Result<T> = { ok: true; value: T } | Refused;

export type IdentityCheckKind =
  "creator_nin" | "owner_bvn" | "business_cac" | "director_bvn";

export type IdentityCheckStatus =
  "started" | "pending" | "verified" | "failed" | "needs_review" | "abandoned";

/** What finish_identity_check answers: the check's status, or why nothing changed. */
export type FinishResult =
  IdentityCheckStatus | "duplicate" | "ignored" | "unknown_reference";

// Starting and reading -----------------------------------------------------------------------

/** Starts (or resumes) the signed-in person's check of this kind. */
export async function startIdentityCheck(
  kind: IdentityCheckKind,
  legalName: string,
): Promise<Result<{ reference: string; checkId: string; resumed: boolean }>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("start_identity_check", {
    kind,
    legal_name: legalName,
  });
  if (error) return refused(error, "start identity check");
  const value = obj(data);
  const reference = str(value.reference);
  const checkId = str(value.check_id);
  if (!reference || !checkId) {
    throw new Error("start identity check returned an unexpected shape");
  }
  return {
    ok: true,
    value: { reference, checkId, resumed: bool(value.resumed) },
  };
}

export type MyIdentityCheck = {
  kind: IdentityCheckKind;
  status: IdentityCheckStatus;
  failureReason: string | null;
  legalNameOnRecord: string | null;
  idLast3: string | null;
  companyNameOnRecord: string | null;
  registrationNumber: string | null;
  createdAt: string;
  decidedAt: string | null;
};

const KINDS: IdentityCheckKind[] = [
  "creator_nin",
  "owner_bvn",
  "business_cac",
  "director_bvn",
];
const STATUSES: IdentityCheckStatus[] = [
  "started",
  "pending",
  "verified",
  "failed",
  "needs_review",
  "abandoned",
];

/** The signed-in person's own checks, newest first (never the fingerprint or date of birth). */
export async function getMyIdentityChecks(): Promise<MyIdentityCheck[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("my_identity_checks");
  if (error) throw new Error(`identity checks failed (${error.code})`);
  return data.flatMap((row) => {
    const kind = KINDS.find((k) => k === row.kind);
    const status = STATUSES.find((s) => s === row.status);
    if (!kind || !status) return [];
    return [
      {
        kind,
        status,
        failureReason: row.failure_reason,
        legalNameOnRecord: row.legal_name_on_record,
        idLast3: row.id_last3,
        companyNameOnRecord: row.company_name_on_record,
        registrationNumber: row.registration_number,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      },
    ];
  });
}

// Facts the server needs (secret-key client) --------------------------------------------------

/** Admins always count. The caller passes a user id it already knows from the session. */
export async function isIdentityVerified(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("identity_verified", {
    person: userId,
  });
  if (error) throw new Error(`identity verified failed (${error.code})`);
  return data === true;
}

export async function isDirectorVerified(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("director_verified", {
    person: userId,
  });
  if (error) throw new Error(`director verified failed (${error.code})`);
  return data === true;
}

/** True when the person verified this kind of ID with this fingerprint. */
export async function fingerprintMatches(
  userId: string,
  kind: IdentityCheckKind,
  fingerprint: string,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc(
    "identity_fingerprint_matches",
    { person: userId, check_kind: kind, fingerprint },
  );
  if (error) throw new Error(`fingerprint match failed (${error.code})`);
  return data === true;
}

export type IdentityCheckForEvent = {
  id: string;
  userId: string;
  kind: IdentityCheckKind;
  status: IdentityCheckStatus;
  legalNameEntered: string;
  createdAt: string;
};

/** The check a provider event refers to, or null. */
export async function getIdentityCheckByReference(
  reference: string,
): Promise<IdentityCheckForEvent | null> {
  const { data, error } = await createAdminClient().rpc(
    "identity_check_by_reference",
    { check_reference: reference },
  );
  if (error) throw new Error(`identity check lookup failed (${error.code})`);
  if (!isObject(data)) return null;
  const kind = KINDS.find((k) => k === data.kind);
  const status = STATUSES.find((s) => s === data.status);
  const id = str(data.id);
  const userId = str(data.user_id);
  const legalNameEntered = str(data.legal_name_entered);
  const createdAt = str(data.created_at);
  if (!kind || !status || !id || !userId || !legalNameEntered || !createdAt) {
    throw new Error("identity check lookup returned an unexpected shape");
  }
  return { id, userId, kind, status, legalNameEntered, createdAt };
}

/** What a failed CAC check kept of CAC's answer, for a corrected name (under 24 hours old). */
export async function getRecentCacCache(
  userId: string,
  rcNumber: string,
): Promise<{ [key: string]: Json | undefined } | null> {
  const { data, error } = await createAdminClient().rpc("recent_cac_cache", {
    person: userId,
    rc_number: rcNumber,
  });
  if (error) throw new Error(`cac cache failed (${error.code})`);
  return isObject(data) ? data : null;
}

export type BusinessCacFacts = {
  checkId: string;
  companyName: string;
  companyType: string;
  registrationNumber: string;
  directors: string[];
  directorsFetchedAt: string | null;
};

/** The business's verified CAC record, or null when it has none. */
export async function getBusinessCacFacts(
  userId: string,
): Promise<BusinessCacFacts | null> {
  const { data, error } = await createAdminClient().rpc("business_cac_facts", {
    person: userId,
  });
  if (error) throw new Error(`cac facts failed (${error.code})`);
  if (!isObject(data)) return null;
  const checkId = str(data.check_id);
  const companyName = str(data.company_name);
  const registrationNumber = str(data.registration_number);
  if (!checkId || !companyName || !registrationNumber) return null;
  return {
    checkId,
    companyName,
    companyType: str(data.company_type) ?? "",
    registrationNumber,
    directors: list(data.directors).flatMap((d) =>
      typeof d === "string" ? [d] : [],
    ),
    directorsFetchedAt: str(data.directors_fetched_at),
  };
}

/** Replaces the director list on the business's verified CAC record after a fresh lookup. */
export async function refreshCacDirectors(
  userId: string,
  directors: string[],
): Promise<void> {
  const { error } = await createAdminClient().rpc("refresh_cac_directors", {
    person: userId,
    new_directors: directors,
  });
  if (error) throw new Error(`refresh directors failed (${error.code})`);
}

// Recording a provider's answer ---------------------------------------------------------------

/** Applies one decision. The event key makes a repeat a no-op ("duplicate"). */
export async function finishIdentityCheck(
  reference: string,
  decision: Json,
  eventKey: string,
): Promise<FinishResult> {
  const { data, error } = await createAdminClient().rpc(
    "finish_identity_check",
    { check_reference: reference, decision, event_key: eventKey },
  );
  if (error) throw new Error(`finish identity check failed (${error.code})`);
  const known: FinishResult[] = [
    ...STATUSES,
    "duplicate",
    "ignored",
    "unknown_reference",
  ];
  const result = known.find((r) => r === data);
  if (!result) {
    throw new Error("finish identity check returned an unexpected value");
  }
  return result;
}

// Short-lived BVN (identity_secrets) ----------------------------------------------------------

export async function storeIdentitySecret(
  checkId: string,
  bvnEncrypted: string,
  phoneEncrypted: string | null,
): Promise<void> {
  const { error } = await createAdminClient().rpc("store_identity_secret", {
    check_uuid: checkId,
    bvn_encrypted: bvnEncrypted,
    // The generated type has no null; the function takes null (no phone).
    phone_encrypted: phoneEncrypted as string,
  });
  if (error) throw new Error(`store identity secret failed (${error.code})`);
}

/** The encrypted BVN and phone while the secret is still valid, or null. */
export async function takeIdentitySecret(
  checkId: string,
): Promise<{ bvnEncrypted: string; phoneEncrypted: string | null } | null> {
  const { data, error } = await createAdminClient().rpc(
    "take_identity_secret",
    { check_uuid: checkId },
  );
  if (error) throw new Error(`take identity secret failed (${error.code})`);
  if (!isObject(data)) return null;
  const bvnEncrypted = str(data.bvn_encrypted);
  return bvnEncrypted
    ? { bvnEncrypted, phoneEncrypted: str(data.phone_encrypted) }
    : null;
}

export async function deleteIdentitySecret(checkId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("delete_identity_secret", {
    check_uuid: checkId,
  });
  if (error) throw new Error(`delete identity secret failed (${error.code})`);
}

// Daily housekeeping --------------------------------------------------------------------------

export async function listIdentityChecksToPoll(max: number): Promise<string[]> {
  const { data, error } = await createAdminClient().rpc(
    "identity_checks_to_poll",
    { max },
  );
  if (error) throw new Error(`identity checks to poll failed (${error.code})`);
  return data;
}

export async function abandonStaleIdentityChecks(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "abandon_stale_identity_checks",
  );
  if (error) throw new Error(`abandon identity checks failed (${error.code})`);
  return num(data) ?? 0;
}

export async function purgeIdentitySecrets(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "purge_identity_secrets",
  );
  if (error) throw new Error(`purge identity secrets failed (${error.code})`);
  return num(data) ?? 0;
}

// Screening -----------------------------------------------------------------------------------

export type ScreeningState =
  "none" | "clear" | "possible_match" | "error" | "confirmed";

export async function getScreeningState(
  userId: string,
): Promise<ScreeningState> {
  const { data, error } = await createAdminClient().rpc("screening_state", {
    person: userId,
  });
  if (error) throw new Error(`screening state failed (${error.code})`);
  const known: ScreeningState[] = [
    "none",
    "clear",
    "possible_match",
    "error",
    "confirmed",
  ];
  const state = known.find((s) => s === data);
  if (!state) throw new Error("screening state returned an unexpected value");
  return state;
}

/** Who to screen: a registered business by its CAC name, anyone else by verified name and date of birth. */
export async function getScreeningFacts(userId: string): Promise<{
  subject: "person" | "business";
  name: string;
  dateOfBirth: string | null;
} | null> {
  const { data, error } = await createAdminClient().rpc("screening_facts", {
    person: userId,
  });
  if (error) throw new Error(`screening facts failed (${error.code})`);
  if (!isObject(data)) return null;
  const subject = str(data.subject);
  const name = str(data.name);
  if ((subject !== "person" && subject !== "business") || !name) return null;
  return { subject, name, dateOfBirth: str(data.date_of_birth) };
}

export async function recordScreening(input: {
  userId: string;
  subject: "person" | "business";
  trigger: "first_payout" | "first_hire" | "admin";
  status: "clear" | "possible_match" | "error";
  matchCount: number;
  providerReference: string | null;
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc("record_screening", {
    person: input.userId,
    subject: input.subject,
    trigger: input.trigger,
    status: input.status,
    match_count: input.matchCount,
    // The generated type has no null; the function takes null.
    provider_reference: input.providerReference as string,
  });
  if (error) throw new Error(`record screening failed (${error.code})`);
  return data;
}

// Admin ---------------------------------------------------------------------------------------

/** Admin only (checked inside): decides a check held for a duplicate ID or RC/BN number. */
export async function reviewIdentityCheck(
  checkId: string,
  outcome: "verified" | "failed",
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("review_identity_check", {
    check_id: checkId,
    outcome,
    reason,
  });
  if (error) return refused(error, "review identity check");
  return { ok: true, value: null };
}

/** Admin only: lets a person who reached the attempt cap try again. */
export async function allowIdentityRetry(
  userId: string,
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("allow_identity_retry", {
    person: userId,
    reason,
  });
  if (error) return refused(error, "allow identity retry");
  return { ok: true, value: null };
}

/** Admin only: clears or confirms a possible sanctions/PEP match. */
export async function reviewScreening(
  screeningId: string,
  outcome: "cleared" | "confirmed",
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("review_screening", {
    screening: screeningId,
    outcome,
    reason,
  });
  if (error) return refused(error, "review screening");
  return { ok: true, value: null };
}

export type IdentityReviewRow = {
  id: string;
  userId: string;
  kind: IdentityCheckKind;
  reference: string;
  failureReason: string | null;
  legalNameOnRecord: string | null;
  idLast3: string | null;
  companyNameOnRecord: string | null;
  registrationNumber: string | null;
  createdAt: string;
};

/** Checks held for an admin (duplicate ID or RC/BN number), oldest first. Admin session only; others see nothing. */
export async function listIdentityReviewQueue(): Promise<IdentityReviewRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("identity_checks")
    .select(
      "id, user_id, kind, reference, failure_reason, legal_name_on_record, id_last3, company_name_on_record, registration_number, created_at",
    )
    .eq("status", "needs_review")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`identity review queue failed (${error.code})`);
  return data.flatMap((row) => {
    const kind = KINDS.find((k) => k === row.kind);
    return kind
      ? [
          {
            id: row.id,
            userId: row.user_id,
            kind,
            reference: row.reference,
            failureReason: row.failure_reason,
            legalNameOnRecord: row.legal_name_on_record,
            idLast3: row.id_last3,
            companyNameOnRecord: row.company_name_on_record,
            registrationNumber: row.registration_number,
            createdAt: row.created_at,
          },
        ]
      : [];
  });
}
