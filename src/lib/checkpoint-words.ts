// How checkpoints read on the pages: the status chip, the numbering, what is
// still outstanding, and the trail in words. Pure, so it can be unit-tested.
// Wording never threatens money: a missed checkpoint holds nothing back.

import { formatDay } from "./campaign.ts";
import { lagosDate, type Metrics } from "./checkpoints.ts";
import { formatDateTime } from "./creator-profile.ts";

export type CheckpointRowView = {
  id: string;
  kind: "kickoff" | "progress";
  dueAt: string;
  status: "skipped" | "due" | "overdue" | "done" | "done_late" | "closed";
  skipReason: "started_after" | "too_soon" | null;
};

export type ChipTone = "info" | "attention" | "success" | "muted";

/** The chip beside a checkpoint: a label, a tone and an optional line of detail. */
export function checkpointChip(
  row: CheckpointRowView,
  now: Date,
): { label: string; tone: ChipTone; detail: string | null } {
  switch (row.status) {
    case "done":
      return { label: "Done", tone: "success", detail: null };
    case "done_late":
      return {
        label: "Done late",
        tone: "info",
        detail: "Sent after it was due.",
      };
    case "skipped":
      return {
        label: "Skipped",
        tone: "muted",
        detail:
          row.skipReason === "started_after"
            ? "Started after this date."
            : "Falls less than 3 days after the start.",
      };
    case "closed":
      return {
        label: "Closed",
        tone: "muted",
        detail: "The final work was submitted.",
      };
    case "overdue":
      return {
        label: "Overdue",
        tone: "attention",
        detail: "Still accepted, even late.",
      };
    case "due":
      // The daily job marks rows overdue; until it runs, the clock decides.
      return new Date(row.dueAt) <= now
        ? {
            label: "Overdue",
            tone: "attention",
            detail: "Still accepted, even late.",
          }
        : { label: "Due", tone: "info", detail: null };
  }
}

/** "Kickoff", then "Checkpoint 1", "Checkpoint 2" ... in date order, skipped ones counted. */
export function numberRows<T extends CheckpointRowView>(
  rows: T[],
): (T & { title: string })[] {
  let n = 0;
  return rows.map((r) => {
    if (r.kind === "kickoff") return { ...r, title: "Kickoff" };
    n += 1;
    return { ...r, title: `Checkpoint ${n}` };
  });
}

/** Rows still waiting for evidence whose time has passed: they block the final submission. */
export function outstandingRows<T extends CheckpointRowView>(
  rows: T[],
  now: Date,
): T[] {
  return rows.filter(
    (r) =>
      (r.status === "due" || r.status === "overdue") &&
      new Date(r.dueAt) <= now,
  );
}

/** The Lagos day a row is due, "YYYY-MM-DD": the end of that day, so the second before. */
export function dueDay(row: CheckpointRowView): string {
  return lagosDate(new Date(new Date(row.dueAt).getTime() - 1000));
}

/** A checkpoint is due on a day, the kickoff at a time; both in Lagos. */
export function dueText(row: CheckpointRowView): string {
  if (row.kind === "kickoff") return formatDateTime(row.dueAt);
  return formatDay(dueDay(row));
}

/** One line per platform: "instagram: 1,200 views, 40 likes". */
export function metricsText(metrics: Metrics): string {
  return metrics
    .map(({ platform, ...figures }) => {
      const parts = Object.entries(figures).flatMap(([key, value]) =>
        typeof value === "number"
          ? [`${value.toLocaleString("en-NG")} ${key.replace("_", " ")}`]
          : [],
      );
      return `${platform}: ${parts.join(", ")}`;
    })
    .join("\n");
}

/** A trail entry in words; `label` is the row's title ("Checkpoint 2"). */
export function trailText(
  event: string,
  detail: Record<string, unknown>,
  label: string,
): string {
  switch (event) {
    case "applied":
      return `${label} applies to this job.`;
    case "skipped":
      return detail.reason === "started_after"
        ? `${label} was skipped: the job started after that date.`
        : `${label} was skipped: it fell less than 3 days after the job started.`;
    case "kickoff_submitted":
      return detail.late === true
        ? "Kickoff confirmed, after it was due."
        : "Kickoff confirmed.";
    case "evidence_submitted":
      return `Evidence sent for ${label}.`;
    case "evidence_late":
      return `Evidence sent for ${label}, after it was due.`;
    case "reminded":
      return `The creator was reminded that ${label} is due soon.`;
    case "overdue":
      return `${label} passed its due time with no evidence.`;
    case "warned":
      return `The creator was warned about ${label}.`;
    case "dispute_available":
      return `The business can now open a dispute about ${label}.`;
    case "closed":
      return `${label} closed: the final work was submitted.`;
    default:
      return label;
  }
}
