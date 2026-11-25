// Campaign checkpoints: when they fall, who they apply to, and what evidence
// they and the final submission need. Pure rules with no framework imports, so
// they can be unit-tested; the database enforces the same rules
// (supabase/migrations/20261125100000 onward). Decisions in
// docs/superpowers/specs/2026-11-22-campaign-checkpoints-design.md.
//
// Dates are Lagos calendar days ("YYYY-MM-DD"); a day is over at the end of
// that day, Lagos time.

export type EvidenceType =
  "progress_update" | "content_links" | "publication_screenshots" | "analytics";

export type FinalRequirement =
  "content_links" | "publication_screenshots" | "analytics" | "final_report";

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  "progress_update",
  "content_links",
  "publication_screenshots",
  "analytics",
];

export const FINAL_REQUIREMENTS: readonly FinalRequirement[] = [
  "content_links",
  "publication_screenshots",
  "analytics",
  "final_report",
];

export const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  progress_update: "A written progress update",
  content_links: "Links to the content so far",
  publication_screenshots: "Screenshots of what is published",
  analytics: "Analytics screenshots and numbers",
};

export const FINAL_REQUIREMENT_LABELS: Record<FinalRequirement, string> = {
  content_links: "Links to the published content",
  publication_screenshots: "Screenshots of the published content",
  analytics: "Analytics screenshots and numbers",
  final_report: "A written final report",
};

export function isEvidenceType(value: unknown): value is EvidenceType {
  return EVIDENCE_TYPES.includes(value as EvidenceType);
}

export function isFinalRequirement(value: unknown): value is FinalRequirement {
  return FINAL_REQUIREMENTS.includes(value as FinalRequirement);
}

/** The preset frequencies the builder offers; anything else is a custom interval. */
export const PRESET_INTERVALS = [3, 7, 14] as const;
export const MIN_INTERVAL_DAYS = 2;
export const MAX_INTERVAL_DAYS = 30;

/** A checkpoint applies only if it falls this many days after the creator's start. */
export const MIN_DAYS_AFTER_START = 3;
export const KICKOFF_HOURS = 48;

/**
 * The interval a builder's frequency choice means: a preset ("3", "7", "14"),
 * or "custom" with the typed number of days. Null when it isn't a valid choice.
 */
export function intervalFromChoice(
  frequency: string,
  customDays: string,
): number | null {
  const raw = frequency === "custom" ? customDays.trim() : frequency;
  if (!/^\d+$/.test(raw)) return null;
  const days = Number(raw);
  const presets: readonly number[] = PRESET_INTERVALS;
  if (frequency !== "custom" && !presets.includes(days)) return null;
  return isValidInterval(days) ? days : null;
}

export function isValidInterval(days: number): boolean {
  return (
    Number.isInteger(days) &&
    days >= MIN_INTERVAL_DAYS &&
    days <= MAX_INTERVAL_DAYS
  );
}

// Dates ---------------------------------------------------------------------------

const lagosFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Lagos calendar day of an instant, "YYYY-MM-DD". */
export function lagosDate(instant: Date): string {
  return lagosFormat.format(instant);
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

// Schedule ------------------------------------------------------------------------

/**
 * The fixed checkpoint dates of a campaign: every `intervalDays` after the
 * start, strictly before final delivery (generate_campaign_checkpoints()).
 */
export function checkpointDates(input: {
  postFrom: string;
  deliverBy: string;
  intervalDays: number;
}): string[] {
  if (!isValidInterval(input.intervalDays)) return [];
  const dates: string[] = [];
  for (let k = 1; ; k++) {
    const due = shiftDay(input.postFrom, k * input.intervalDays);
    if (due >= input.deliverBy) break;
    dates.push(due);
  }
  return dates;
}

/**
 * Whether a checkpoint applies to a creator who started at `startedAt`:
 * only if it falls at least 3 days after their Lagos start date. Otherwise
 * it is skipped, and the trail says why.
 */
export function checkpointApplies(
  dueOn: string,
  startedAt: Date,
): "applies" | "started_after" | "too_soon" {
  const startDay = lagosDate(startedAt);
  if (dueOn < startDay) return "started_after";
  if (dueOn >= shiftDay(startDay, MIN_DAYS_AFTER_START)) return "applies";
  return "too_soon";
}

/** The kickoff confirmation is due 48 hours after "Start work". */
export function kickoffDueAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + KICKOFF_HOURS * 3_600_000);
}

// Timeline bar ----------------------------------------------------------------------

export type TimelineMarker = {
  kind: "cutoff" | "checkpoint";
  date: string;
  percent: number;
};

/**
 * Positions for the progress bar. A campaign without a start date begins at
 * its go-live date; without an end date it ends at final delivery.
 */
export function timelineView(input: {
  start: string | null;
  liveFrom: string;
  deliverBy: string;
  endsOn: string | null;
  checkpoints: string[];
  today: string;
}): {
  from: string;
  to: string;
  todayPercent: number;
  markers: TimelineMarker[];
} {
  const from = input.start ?? input.liveFrom;
  const to = input.endsOn ?? input.deliverBy;
  const span = Math.max(dayNumber(to) - dayNumber(from), 1);
  const percentOf = (day: string) => {
    const raw = ((dayNumber(day) - dayNumber(from)) / span) * 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  };
  const markers: TimelineMarker[] = [
    ...input.checkpoints.map((date) => ({
      kind: "checkpoint" as const,
      date,
      percent: percentOf(date),
    })),
    {
      kind: "cutoff" as const,
      date: input.deliverBy,
      percent: percentOf(input.deliverBy),
    },
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { from, to, todayPercent: percentOf(input.today), markers };
}

// Metrics -----------------------------------------------------------------------------

export const METRIC_KEYS = [
  "views",
  "reach",
  "impressions",
  "likes",
  "comments",
  "shares",
  "saves",
  "link_clicks",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/**
 * Numbers the creator reports from a platform's own analytics. The same shape
 * is stored as jsonb (keys as written here) and checked again in the database.
 */
export type Metrics = ({ platform: string } & Partial<
  Record<MetricKey, number>
>)[];

export const MAX_METRIC_PLATFORMS = 6;

export function parseMetrics(
  value: unknown,
): { ok: true; metrics: Metrics } | { ok: false; error: string } {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_METRIC_PLATFORMS
  ) {
    return {
      ok: false,
      error: `Report numbers for 1 to ${MAX_METRIC_PLATFORMS} platforms.`,
    };
  }
  const metrics: Metrics = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return {
        ok: false,
        error: "Each platform's numbers must be a set of figures.",
      };
    }
    const row = entry as Record<string, unknown>;
    const platform = row.platform;
    if (
      typeof platform !== "string" ||
      platform.length < 1 ||
      platform.length > 30
    ) {
      return {
        ok: false,
        error: "Name the platform each set of numbers is from.",
      };
    }
    const parsed: { platform: string } & Partial<Record<MetricKey, number>> = {
      platform,
    };
    let count = 0;
    for (const [key, figure] of Object.entries(row)) {
      if (key === "platform") continue;
      if (!METRIC_KEYS.includes(key as MetricKey)) {
        return { ok: false, error: `${key} is not a figure we ask for.` };
      }
      if (
        typeof figure !== "number" ||
        !Number.isSafeInteger(figure) ||
        figure < 0
      ) {
        return {
          ok: false,
          error: "Figures must be whole numbers, zero or more.",
        };
      }
      parsed[key as MetricKey] = figure;
      count++;
    }
    if (count === 0) {
      return { ok: false, error: `Add at least one figure for ${platform}.` };
    }
    metrics.push(parsed);
  }
  return { ok: true, metrics };
}

// Evidence ------------------------------------------------------------------------------

export const MAX_EVIDENCE_LINKS = 10;
export const MAX_EVIDENCE_FILES = 5;
export const NOTE_MIN = 20;
export const NOTE_MAX = 1000;
export const REPORT_MIN = 100;
export const REPORT_MAX = 1000;

function isHttpsLink(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function linkProblems(links: string[]): string[] {
  if (links.length < 1) return ["Add at least one link to the content."];
  if (links.length > MAX_EVIDENCE_LINKS) {
    return [`Add no more than ${MAX_EVIDENCE_LINKS} links.`];
  }
  if (!links.every(isHttpsLink)) return ["Links must start with https://"];
  return [];
}

function analyticsProblems(e: {
  fileCount: number;
  metrics: Metrics | null;
  capturedOn: string | null;
}): string[] {
  const problems: string[] = [];
  if (e.fileCount < 1) problems.push("Add a screenshot of your analytics.");
  if (!e.metrics) problems.push("Add the numbers from your analytics.");
  if (!e.capturedOn)
    problems.push("Say which day the analytics were captured.");
  return problems;
}

/** What is still missing from one progress checkpoint's evidence (empty = fine). */
export function evidenceProblems(
  required: EvidenceType[],
  e: {
    note: string | null;
    links: string[];
    fileCount: number;
    metrics: Metrics | null;
    capturedOn: string | null;
  },
): string[] {
  const problems: string[] = [];
  const noteLength = (e.note ?? "").trim().length;
  if (
    required.includes("progress_update") &&
    (noteLength < NOTE_MIN || noteLength > NOTE_MAX)
  ) {
    problems.push(
      `Write a progress update of ${NOTE_MIN} to ${NOTE_MAX} characters.`,
    );
  }
  if (required.includes("content_links"))
    problems.push(...linkProblems(e.links));
  if (
    required.includes("publication_screenshots") &&
    (e.fileCount < 1 || e.fileCount > MAX_EVIDENCE_FILES)
  ) {
    problems.push(
      `Add 1 to ${MAX_EVIDENCE_FILES} screenshots of what is published.`,
    );
  }
  if (required.includes("analytics")) problems.push(...analyticsProblems(e));
  return problems;
}

/**
 * What the final submission still lacks (empty = fine). The capture day of
 * analytics can't be before the campaign's start or in the future.
 */
export function finalRequirementProblems(
  required: FinalRequirement[],
  s: {
    links: string[];
    fileCount: number;
    metrics: Metrics | null;
    capturedOn: string | null;
    report: string | null;
    postFrom: string | null;
    today: string;
  },
): string[] {
  const problems: string[] = [];
  if (required.includes("content_links"))
    problems.push(...linkProblems(s.links));
  if (required.includes("publication_screenshots") && s.fileCount < 1) {
    problems.push("Add a screenshot of the published content.");
  }
  if (required.includes("analytics")) {
    problems.push(...analyticsProblems(s));
    if (s.capturedOn) {
      if (s.postFrom && s.capturedOn < s.postFrom) {
        problems.push(
          "The analytics can't be from before the campaign started.",
        );
      } else if (s.capturedOn > s.today) {
        problems.push("The analytics can't be from a future day.");
      }
    }
  }
  if (required.includes("final_report")) {
    const length = (s.report ?? "").trim().length;
    if (length < REPORT_MIN || length > REPORT_MAX) {
      problems.push(
        `Write a final report of ${REPORT_MIN} to ${REPORT_MAX} characters.`,
      );
    }
  }
  return problems;
}
