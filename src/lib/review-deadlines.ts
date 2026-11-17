// The daily review-deadline job (Stage 7; CLAUDE.md §6 rule 9): release
// submitted work the business didn't review within 7 days, remind businesses
// before the deadline, and clear proof uploads that were never attached.
//
// Invariants:
//   - Safe to run twice or late: each database function only acts on what is
//     due, re-checks under its locks, and marks what it did (auto_release
//     migration).
//   - The steps run in order and one failing never stops the others: the
//     release (money) comes first so a reminder is never sent for work that
//     is already past its deadline, and orphan clean-up is last because
//     nothing depends on it.
//   - Any failed step makes the cron answer 500 so the scheduler's log shows
//     it. Logs carry the step and the error class, never messages.
//
// The database comes in through `deps`, so node tests pass fakes.

export type ReviewDeadlineDeps = {
  releaseOverdueSubmissions: () => Promise<number>;
  sendReviewReminders: () => Promise<number>;
  deleteOrphanProofFiles: () => Promise<string[]>;
};

/** Each count, or null when that step failed. */
export type ReviewDeadlinesResult = {
  released: number | null;
  reminded: number | null;
  orphans: number | null;
};

// Imported lazily because it loads the Supabase clients, which node tests cannot.
async function realDeps(): Promise<ReviewDeadlineDeps> {
  const submissions = await import("./db/submissions.ts");
  return {
    releaseOverdueSubmissions: submissions.releaseOverdueSubmissions,
    sendReviewReminders: submissions.sendReviewReminders,
    deleteOrphanProofFiles: submissions.deleteOrphanProofFiles,
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
    result.reminded === null ||
    result.orphans === null;
  return failed ? 500 : 200;
}

export async function runReviewDeadlines(
  deps?: ReviewDeadlineDeps,
): Promise<ReviewDeadlinesResult> {
  const d = deps ?? (await realDeps());
  const released = await attempt(
    "auto-release failed",
    d.releaseOverdueSubmissions,
  );
  const reminded = await attempt(
    "review reminders failed",
    d.sendReviewReminders,
  );
  // Task 6 deletes these paths from the work-proof bucket.
  const orphans = await attempt(
    "orphan proof files failed",
    async () => (await d.deleteOrphanProofFiles()).length,
  );
  return { released, reminded, orphans };
}
