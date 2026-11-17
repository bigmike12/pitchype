// Data access for submissions: proof of work and the business's review.
//
// Every change goes through a database function that checks the caller and
// takes the locks (the create_submissions and auto_release migrations). The
// daily job's functions act for no one person, so they use the secret-key
// client and are service_role-only in SQL.

import { createAdminClient } from "@/lib/supabase/admin";

// The daily job ------------------------------------------------------------------------------

/** Releases submitted work past its review deadline; returns how many hires. */
export async function releaseOverdueSubmissions(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "release_overdue_submissions",
  );
  if (error) throw new Error(`auto-release failed (${error.code})`);
  return data;
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
