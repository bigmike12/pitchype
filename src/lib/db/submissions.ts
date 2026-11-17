// Data access for submissions: proof of work and the business's review.
//
// Every change goes through a database function that checks the caller and
// takes the locks (the create_submissions and auto_release migrations), called
// with the signed-in person's session. The daily job's functions act for no
// one person, so they use the secret-key client and are service_role-only in
// SQL. Reads go through the session too, so row level security decides what a
// person sees; only then are the screenshots that came back signed.

import { proofFileUrls } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

import { refused, type Result } from "./refusal";

// The generated types don't model SQL nulls for function arguments.
const nullable = <T>(value: T | null) => value as T;

// The person's own actions ------------------------------------------------------------------------

/**
 * The creator submits proof of work: a note, links and screenshots already
 * stored and registered (`fileIds`, in upload order). Returns the new
 * submission's id.
 */
export async function submitWork(
  engagementId: string,
  note: string | null,
  links: string[],
  fileIds: string[],
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("submit_work", {
    engagement: engagementId,
    note: nullable<string>(note),
    links,
    file_ids: fileIds,
  });
  if (error) return refused(error, "submit work");
  return { ok: true, value: data };
}

/**
 * The business accepts the work and releases escrow. `auto_released` means
 * the review time had already passed, so the work was released instead.
 */
export async function acceptSubmission(
  engagementId: string,
): Promise<Result<"accepted" | "auto_released">> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("accept_submission", {
    engagement: engagementId,
  });
  if (error) return refused(error, "accept submission");
  return {
    ok: true,
    value: data === "auto_released" ? "auto_released" : "accepted",
  };
}

/**
 * The business denies the work with 1 to 5 reasons. `review_closed` means the
 * review time had already passed, so the work was released and the denial
 * not recorded.
 */
export async function denySubmission(
  engagementId: string,
  reasons: string[],
): Promise<Result<"denied" | "review_closed">> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("deny_submission", {
    engagement: engagementId,
    reasons,
  });
  if (error) return refused(error, "deny submission");
  return {
    ok: true,
    value: data === "review_closed" ? "review_closed" : "denied",
  };
}

/** The creator withdraws after starting; settled as the creator at fault. */
export async function withdrawFromEngagement(
  engagementId: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("withdraw_from_engagement", {
    engagement: engagementId,
  });
  if (error) return refused(error, "withdraw from engagement");
  return { ok: true, value: null };
}

// Reads ---------------------------------------------------------------------------------------------------

export type SubmissionStatus =
  "pending_review" | "accepted" | "denied" | "auto_accepted";

export type SubmissionView = {
  id: string;
  round: number;
  status: SubmissionStatus;
  note: string | null;
  links: string[];
  /** Signed, valid for 10 minutes, in the order they were uploaded. */
  files: { url: string }[];
  createdAt: string;
  reviewDeadlineAt: string;
  decidedAt: string | null;
  denialReasons: string[];
};

/** A hire's submissions, oldest round first, for either side or an admin. */
export async function listSubmissions(
  engagementId: string,
): Promise<SubmissionView[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, round, status, note, links, created_at, review_deadline_at, decided_at, denial_reasons, proof_files (path, created_at)",
    )
    .eq("engagement_id", engagementId)
    .order("round", { ascending: true })
    .order("created_at", { ascending: true, referencedTable: "proof_files" });
  if (error) throw new Error(`submissions lookup failed (${error.code})`);

  const urls = await proofFileUrls(
    data.flatMap((row) => row.proof_files.map((file) => file.path)),
  );
  return data.map((row) => ({
    id: row.id,
    round: row.round,
    status: row.status as SubmissionStatus,
    note: row.note,
    links: row.links,
    files: row.proof_files.flatMap((file) => {
      const url = urls.get(file.path);
      return url ? [{ url }] : [];
    }),
    createdAt: row.created_at,
    reviewDeadlineAt: row.review_deadline_at,
    decidedAt: row.decided_at,
    denialReasons: row.denial_reasons ?? [],
  }));
}

// The daily job ------------------------------------------------------------------------------

/**
 * Releases submitted work past its review deadline: how many hires were
 * released, and how many couldn't be (each rolled back on its own and
 * retried by the next run).
 */
export async function releaseOverdueSubmissions(): Promise<{
  released: number;
  failed: number;
}> {
  const { data, error } = await createAdminClient().rpc(
    "release_overdue_submissions",
  );
  if (error) throw new Error(`auto-release failed (${error.code})`);
  const row = data?.[0];
  if (!row) throw new Error("auto-release returned no counts");
  return { released: row.released, failed: row.failed };
}

/** Sends the 3-day and 1-day review reminders that are due; returns how many. */
export async function sendReviewReminders(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "send_review_reminders",
  );
  if (error) throw new Error(`review reminders failed (${error.code})`);
  return data;
}

/**
 * Deletes the rows of proof files never attached within a day and returns
 * their paths in the work-proof bucket.
 */
export async function deleteOrphanProofFiles(): Promise<string[]> {
  const { data, error } = await createAdminClient().rpc(
    "delete_orphan_proof_files",
  );
  if (error) throw new Error(`orphan proof files failed (${error.code})`);
  return data ?? [];
}
