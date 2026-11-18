// Shaping click counts for the per-click dashboards: every day in a range
// (gaps as zero), bar heights, and named sources. Pure, so node tests cover
// it; the components in src/components/clicks only draw what comes out.

import { addDays, CHANNEL_LABELS, isChannel } from "./campaign.ts";
import type { ClickSource } from "./clicks.ts";

export type ClickDay = { day: string; billable: number; hits: number };

/** The most days a chart shows; a longer range keeps the latest. */
export const MAX_CHART_DAYS = 120;

/** Every Lagos day from `from` to `to` inclusive, in order; missing days are zero. */
export function fillDays(
  days: ClickDay[],
  from: string,
  to: string,
): ClickDay[] {
  if (to < from) return [];
  const byDay = new Map(days.map((d) => [d.day, d]));
  let start = from;
  // Count back from `to`, so a long range keeps its latest days.
  const earliest = addDays(to, -(MAX_CHART_DAYS - 1));
  if (start < earliest) start = earliest;
  const out: ClickDay[] = [];
  for (let day = start; day <= to; day = addDays(day, 1)) {
    out.push(byDay.get(day) ?? { day, billable: 0, hits: 0 });
  }
  return out;
}

/** Heights in px scaled to the tallest value; any non-zero value is at least 2px. */
export function barHeights(values: number[], maxPx: number): number[] {
  const top = Math.max(0, ...values);
  if (top === 0) return values.map(() => 0);
  return values.map((v) =>
    v <= 0 ? 0 : Math.max(2, Math.round((v / top) * maxPx)),
  );
}

const OTHER_LABELS: Record<"other_site" | "unknown", string> = {
  other_site: "Other websites",
  unknown: "Unknown or direct",
};

export type SourceRow = {
  source: ClickSource;
  label: string;
  count: number;
  /** Whole percent of all the hits listed. */
  share: number;
};

/** Sources with a name and share, biggest first (ties by name). */
export function sourceRows(sources: Record<string, number>): SourceRow[] {
  const rows = Object.entries(sources).flatMap(([source, count]) => {
    if (count <= 0) return [];
    if (isChannel(source)) {
      return [
        { source: source as ClickSource, label: CHANNEL_LABELS[source], count },
      ];
    }
    if (source === "other_site" || source === "unknown") {
      return [
        { source: source as ClickSource, label: OTHER_LABELS[source], count },
      ];
    }
    return [];
  });
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return rows
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((r) => ({ ...r, share: Math.round((r.count / total) * 100) }));
}
