// A per-click campaign's results as CSV for the business: one row per hire.
// Cells are guarded against spreadsheet formulas and quoted like the ledger
// export (textCell); amounts are naira with two decimals from whole kobo.

import { koboToNairaString, textCell } from "./ledger-csv.ts";

export type ClickCsvRow = {
  creatorName: string;
  code: string | null;
  billable: number;
  notCounted: number;
  spentKobo: number;
  /** Null until the hire has settled. */
  backKobo: number | null;
  status: string;
};

const HEADER = [
  "Creator",
  "Link",
  "Clicks counted",
  "Visits not counted",
  "Spent (NGN)",
  "Back to you (NGN)",
  "Status",
].join(",");

export function clicksToCsv(rows: ClickCsvRow[]): string {
  const lines = [HEADER];
  for (const r of rows) {
    lines.push(
      [
        textCell(r.creatorName),
        textCell(r.code),
        String(r.billable),
        String(r.notCounted),
        koboToNairaString(r.spentKobo),
        r.backKobo === null ? "" : koboToNairaString(r.backKobo),
        textCell(r.status),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * One row per paid hire, from its own settlement: a settled hire shows what
 * was released and refunded; a running one what its clicks are worth so far.
 */
export function clickCsvRows(
  hires: {
    creatorName: string;
    code: string | null;
    billable: number;
    totalHits: number;
    spentKobo: number;
    settledAt: string | null;
    refundedKobo: number | null;
  }[],
): ClickCsvRow[] {
  return hires.map((h) => ({
    creatorName: h.creatorName,
    code: h.code,
    billable: h.billable,
    notCounted: h.totalHits - h.billable,
    spentKobo: h.spentKobo,
    backKobo: h.settledAt ? (h.refundedKobo ?? 0) : null,
    status: h.settledAt ? "Settled" : "Running",
  }));
}
