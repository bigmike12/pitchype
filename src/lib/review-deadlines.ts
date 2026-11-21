// The daily review-deadline job (Stage 7; CLAUDE.md §6 rule 9): release
// submitted work the business didn't review within 7 days, remind businesses
// before the deadline, and clear proof uploads that were never attached.
//
// Invariants:
//   - Safe to run twice or late: each database function only acts on what is
//     due, re-checks under its locks, and marks what it did (auto_release
//     migration).
//   - Checkpoint notices (reminders, overdue notices, warnings) are one more
//     step after the review reminders. They only send notices and write the
//     checkpoint trail: no money, no status, no review deadline.
//   - The steps run in order and one failing never stops the others: the
//     release (money) comes first, and orphan clean-up is last because
//     nothing depends on it. (A reminder is never sent for work already past
//     its deadline because the reminders query itself excludes deadlines in
//     the past, not because of the order.)
//   - Orphan clean-up has two parts: the database rows go first and hand back
//     their paths, then the files are deleted from the work-proof bucket. A
//     file that can't be deleted is not retried (its row is already gone) but
//     is reported, so someone can clear it by hand.
//   - Any failed step makes the cron answer 500 so the scheduler's log shows
//     it, and so does any hire the release step couldn't settle (each is
//     rolled back on its own, the rest are still released, and the next run
//     retries it). Logs carry the step and the error class, or a count of
//     failed hires or files, never messages or paths.
//
// The database comes in through `deps`, so node tests pass fakes.

/** What the daily checkpoint step sent; `failed` counts hires it couldn't finish (retried next run). */
export type CheckpointNoticeCounts = {
  reminded: number;
  overdue: number;
  warned: number;
  disputeAvailable: number;
  failed: number;
};

export type ReviewDeadlineDeps = {
  releaseOverdueSubmissions: () => Promise<{
    released: number;
    failed: number;
  }>;
  sendReviewReminders: () => Promise<number>;
  runCheckpointNotices: () => Promise<CheckpointNoticeCounts>;
  deleteOrphanProofFiles: () => Promise<string[]>;
  deleteProofObjects: (paths: string[]) => Promise<void>;
};

/** Each count, or null when that step failed. */
export type ReviewDeadlinesResult = {
  released: number | null;
  /** Overdue hires that couldn't be released this run. */
  releaseFailed: number | null;
  reminded: number | null;
  /** Checkpoint reminders, overdue notices and warnings sent; null when the step failed. */
  checkpointNotices: CheckpointNoticeCounts | null;
  orphans: number | null;
  /** Orphan files that couldn't be deleted from storage this run. */
  proofObjectsFailed: number;
};

// Imported lazily because it loads the Supabase clients, which node tests cannot.
async function realDeps(): Promise<ReviewDeadlineDeps> {
  const submissions = await import("./db/submissions.ts");
  const checkpoints = await import("./db/checkpoints.ts");
  const storage = await import("./storage.ts");
  return {
    releaseOverdueSubmissions: submissions.releaseOverdueSubmissions,
    sendReviewReminders: submissions.sendReviewReminders,
    runCheckpointNotices: checkpoints.runCheckpointNotices,
    deleteOrphanProofFiles: submissions.deleteOrphanProofFiles,
    deleteProofObjects: storage.deleteProofObjects,
  };
}

/** Runs one step; null and a log line when it throws. */
async function attempt<T>(
  label: string,
  step: () => Promise<T>,
): Promise<T | null> {
  try {
    return await step();
  } catch (error) {
    console.error(label, error instanceof Error ? error.name : "NonError");
    return null;
  }
}

/** HTTP status for the cron response: 500 when any step failed. */
export function cronStatus(result: ReviewDeadlinesResult): 200 | 500 {
  const failed =
    result.released === null ||
    result.releaseFailed === null ||
    result.releaseFailed > 0 ||
    result.reminded === null ||
    result.checkpointNotices === null ||
    result.checkpointNotices.failed > 0 ||
    result.orphans === null ||
    result.proofObjectsFailed > 0;
  return failed ? 500 : 200;
}

export async function runReviewDeadlines(
  deps?: ReviewDeadlineDeps,
): Promise<ReviewDeadlinesResult> {
  const d = deps ?? (await realDeps());
  const release = await attempt(
    "auto-release failed",
    d.releaseOverdueSubmissions,
  );
  if (release && release.failed > 0) {
    console.error("auto-release failed for hires", release.failed);
  }
  const reminded = await attempt(
    "review reminders failed",
    d.sendReviewReminders,
  );
  const checkpointNotices = await attempt(
    "checkpoint notices failed",
    d.runCheckpointNotices,
  );
  if (checkpointNotices && checkpointNotices.failed > 0) {
    console.error(
      "checkpoint notices failed for hires",
      checkpointNotices.failed,
    );
  }
  const orphanPaths = await attempt(
    "orphan proof files failed",
    d.deleteOrphanProofFiles,
  );
  let proofObjectsFailed = 0;
  if (orphanPaths && orphanPaths.length > 0) {
    try {
      await d.deleteProofObjects(orphanPaths);
    } catch {
      // The count only: storage errors can name paths.
      proofObjectsFailed = orphanPaths.length;
      console.error("proof file delete failed for", proofObjectsFailed);
    }
  }
  return {
    released: release?.released ?? null,
    releaseFailed: release?.failed ?? null,
    reminded,
    checkpointNotices,
    orphans: orphanPaths ? orphanPaths.length : null,
    proofObjectsFailed,
  };
}
