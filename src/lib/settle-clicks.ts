// The daily click-settlement job (pay per click, Part 2): tell both people
// when a per-click hire's click window has ended, and settle each hire for its
// counted clicks once the 72-hour hold is over (settle_due_click_hires()).
//
// Invariants:
//   - Safe to run twice or late: the database claims each hold notice under a
//     lock and settles each hire at most once (click_settlement migration).
//   - A hire that couldn't settle is rolled back on its own; the rest still
//     settle and the next run retries it. Any failure makes the cron answer
//     500 so the scheduler's log shows it.
//   - Logs carry counts and the error class, never messages.
//
// The database comes in through `deps`, so node tests pass fakes.

export type SettleClicksCounts = {
  notified: number;
  settled: number;
  failed: number;
};

export type SettleClicksDeps = {
  settle: () => Promise<SettleClicksCounts>;
  log: (line: string) => void;
};

export type SettleClicksResult = SettleClicksCounts & { ok: boolean };

// Imported lazily because it loads the Supabase clients, which node tests cannot.
async function realDeps(): Promise<SettleClicksDeps> {
  const clicks = await import("./db/clicks.ts");
  return {
    settle: clicks.settleDueClickHires,
    log: (line) => console.error(line),
  };
}

export async function runSettleClicks(
  deps?: SettleClicksDeps,
): Promise<SettleClicksResult> {
  const d = deps ?? (await realDeps());
  try {
    const counts = await d.settle();
    if (counts.failed > 0) {
      d.log(`click settlement failed for ${counts.failed} hires`);
    }
    return { ...counts, ok: counts.failed === 0 };
  } catch (error) {
    d.log(
      `click settlement failed: ${error instanceof Error ? error.name : "NonError"}`,
    );
    return { ok: false, notified: 0, settled: 0, failed: 0 };
  }
}
