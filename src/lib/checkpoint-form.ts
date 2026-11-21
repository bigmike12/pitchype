// Reads the checkpoint and final-submission forms: figures typed per platform
// (fields named metric.<platform>.<figure>), the capture day and the reporting
// period. The database checks the same rules again (valid_metrics(),
// write_checkpoint_evidence()); these give a message instead of a refusal code.
// No framework imports, so Node's test runner can load it.

import type { FormState } from "./form-data.ts";
import { METRIC_KEYS, parseMetrics, type Metrics } from "./checkpoints.ts";
import { PLATFORMS } from "./creator-profile.ts";

/** The fields a checkpoint, kickoff or final-submission form can show an error on. */
export type EvidenceField =
  | "links"
  | "note"
  | "screenshots"
  | "metrics"
  | "capturedOn"
  | "periodFrom"
  | "periodTo"
  | "report"
  | "confirm";

export type EvidenceFormState = FormState<EvidenceField>;

/** The label of each figure on the form. */
export const METRIC_LABELS: Record<(typeof METRIC_KEYS)[number], string> = {
  views: "Views",
  reach: "Reach",
  impressions: "Impressions",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  link_clicks: "Link clicks",
};

export const metricFieldName = (platform: string, key: string) =>
  `metric.${platform}.${key}`;

/**
 * Figures typed per platform, as the database stores them. Empty fields are
 * skipped; none at all gives null. A figure must be a whole number.
 */
export function parseMetricsForm(
  form: FormData,
): { ok: true; metrics: Metrics | null } | { ok: false; message: string } {
  const entries: Record<string, unknown>[] = [];
  for (const platform of PLATFORMS) {
    const figures: Record<string, unknown> = { platform };
    let any = false;
    for (const key of METRIC_KEYS) {
      const raw = form.get(metricFieldName(platform, key));
      const typed = typeof raw === "string" ? raw.trim().replace(/,/g, "") : "";
      if (typed === "") continue;
      if (!/^\d{1,15}$/.test(typed)) {
        return {
          ok: false,
          message: "Figures must be whole numbers, like 1200.",
        };
      }
      figures[key] = Number(typed);
      any = true;
    }
    if (any) entries.push(figures);
  }
  if (entries.length === 0) return { ok: true, metrics: null };
  const parsed = parseMetrics(entries);
  return parsed.ok
    ? { ok: true, metrics: parsed.metrics }
    : { ok: false, message: parsed.error };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An optional calendar day typed in a date field: "" gives null, junk is an error. */
export function parseOptionalDay(
  raw: string,
): { ok: true; day: string | null } | { ok: false } {
  const day = raw.trim();
  if (day === "") return { ok: true, day: null };
  const valid =
    DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
  return valid ? { ok: true, day } : { ok: false };
}
