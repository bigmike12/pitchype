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

export type ChipTone = "info" | "next" | "attention" | "success" | "muted";

const DAY_MS = 86_400_000;

/**
 * The chip beside a checkpoint: a label, a tone and an optional line of detail.
 * In the database every row still waiting is `due`, however far away; on the
 * page only the next one, or one within a day of its time, reads as due.
 * `isNext` marks the first row still waiting (`nextRowId`).
 */
export function checkpointChip(
  row: CheckpointRowView,
  now: Date,
  isNext = false,
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
    case "due": {
      // The daily job marks rows overdue; until it runs, the clock decides.
      const left = new Date(row.dueAt).getTime() - now.getTime();
      if (left <= 0) {
        return {
          label: "Overdue",
          tone: "attention",
          detail: "Still accepted, even late.",
        };
      }
      if (left <= DAY_MS)
        return { label: "Due soon", tone: "next", detail: null };
      if (isNext) return { label: "Up next", tone: "next", detail: null };
      return { label: "Upcoming", tone: "muted", detail: null };
    }
  }
}

/** The first row still waiting for evidence: the one to work on now. */
export function nextRowId(rows: CheckpointRowView[]): string | null {
  return (
    rows.find((r) => r.status === "due" || r.status === "overdue")?.id ?? null
  );
}

/**
 * When a checkpoint opens for evidence: the start of the day before its due
 * day, Lagos time. It is due at the end of its day and Lagos has no daylight
 * saving, so that is 48 hours before. The kickoff is open from the start
 * (null). submit_checkpoint() enforces the same (migration 20261201100000).
 */
export function checkpointOpensAt(row: CheckpointRowView): Date | null {
  if (row.kind === "kickoff") return null;
  return new Date(new Date(row.dueAt).getTime() - 2 * DAY_MS);
}

/** A checkpoint still to come that doesn't take evidence yet. */
export function isLocked(row: CheckpointRowView, now: Date): boolean {
  const opens = checkpointOpensAt(row);
  return row.status === "due" && opens !== null && now < opens;
}

/** Finished rows out of the rows that apply (skipped ones don't count). */
export function checkpointProgress(rows: CheckpointRowView[]): {
  done: number;
  total: number;
} {
  const applies = rows.filter((r) => r.status !== "skipped");
  return {
    done: applies.filter((r) => r.status === "done" || r.status === "done_late")
      .length,
    total: applies.length,
  };
}

/** How far the due day is from today, both Lagos days: "today", "in 3 days", "2 days ago". */
export function dueWhen(row: CheckpointRowView, now: Date): string {
  const days = Math.round(
    (Date.parse(`${dueDay(row)}T00:00:00Z`) -
      Date.parse(`${lagosDate(now)}T00:00:00Z`)) /
      DAY_MS,
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
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

/** The Lagos day a row is due, "YYYY-MM-DD": the end of that day, so the second before. The kickoff's is the day of its due time. */
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

export type TrailEventView = {
  id: string;
  hireCheckpointId: string | null;
  event: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type TrailEntry = {
  id: string;
  text: string;
  createdAt: string;
  tone: "success" | "attention" | "muted";
};

const TRAIL_TONE: Record<string, TrailEntry["tone"]> = {
  kickoff_submitted: "success",
  evidence_submitted: "success",
  evidence_late: "success",
  overdue: "attention",
  warned: "attention",
  dispute_available: "attention",
};

/**
 * The trail as lines to show. "Start work" writes an `applied` event for
 * every row at once; those fold into one line ("the kickoff and 8 checkpoints
 * apply"), so the trail shows what actually happened since.
 */
export function trailEntries(
  events: TrailEventView[],
  rows: CheckpointRowView[],
): TrailEntry[] {
  const numbered = new Map(numberRows(rows).map((r) => [r.id, r]));
  const applied = events.filter((e) => e.event === "applied");
  const entries: TrailEntry[] = [];
  if (applied.length > 0) {
    const kinds = applied.map(
      (e) =>
        (e.hireCheckpointId && numbered.get(e.hireCheckpointId)?.kind) ||
        "progress",
    );
    const kickoff = kinds.includes("kickoff");
    const count = kinds.filter((k) => k === "progress").length;
    const checkpoints = `${count} checkpoint${count === 1 ? "" : "s"}`;
    const what =
      kickoff && count > 0
        ? `the kickoff and ${checkpoints} apply`
        : kickoff
          ? "the kickoff applies"
          : `${checkpoints} ${count === 1 ? "applies" : "apply"}`;
    entries.push({
      id: applied[0].id,
      text: `Work started: ${what} to this job.`,
      createdAt: applied[0].createdAt,
      tone: "muted",
    });
  }
  for (const e of events) {
    if (e.event === "applied") continue;
    const title =
      (e.hireCheckpointId && numbered.get(e.hireCheckpointId)?.title) ||
      "A checkpoint";
    entries.push({
      id: e.id,
      text: trailText(e.event, e.detail, title),
      createdAt: e.createdAt,
      tone: TRAIL_TONE[e.event] ?? "muted",
    });
  }
  return entries;
}
