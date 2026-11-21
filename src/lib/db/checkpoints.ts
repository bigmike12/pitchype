// Data access for checkpoints: each hire's kickoff and progress checkpoints,
// the evidence sent for them and the trail of what happened (migration
// 20261125100100). Writes go through database functions that check the
// caller and the hire under locks; reads go through the session, so row level
// security decides who sees what, and only then are screenshots signed.
// Checkpoints are a record: nothing here moves money or changes a hire.

import "server-only";

import { parseMetrics, type Metrics } from "@/lib/checkpoints";
import { proofFileUrls } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { refused, type Result } from "./refusal";

// The generated types don't model SQL nulls for function arguments.
const nullable = <T>(value: T | null) => value as T;

export type CheckpointStatus =
  "skipped" | "due" | "overdue" | "done" | "done_late" | "closed";

export type CheckpointEvidenceView = {
  id: string;
  createdAt: string;
  note: string | null;
  links: string[];
  metrics: Metrics | null;
  capturedOn: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  confirmedBrief: boolean | null;
  confirmedStarted: boolean | null;
  /** Arrived after the due time. */
  late: boolean;
  /** Signed, valid for 10 minutes, in upload order. */
  files: { url: string }[];
};

export type HireCheckpoint = {
  id: string;
  kind: "kickoff" | "progress";
  /** The end of the due day in Lagos for a checkpoint, 48 hours after the start for the kickoff. */
  dueAt: string;
  status: CheckpointStatus;
  skipReason: "started_after" | "too_soon" | null;
  evidenceAt: string | null;
  /** Oldest first; a later entry supersedes for display, all are kept. */
  evidence: CheckpointEvidenceView[];
};

/** A hire's kickoff first, then its checkpoints by date, for either person or an admin. */
export async function listHireCheckpoints(
  engagementId: string,
): Promise<HireCheckpoint[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("hire_checkpoints")
    .select(
      "id, kind, due_at, status, skip_reason, evidence_at, checkpoint_evidence (id, note, links, metrics, captured_on, period_from, period_to, confirmed_brief, confirmed_started, late, created_at, proof_files (path, created_at))",
    )
    .eq("engagement_id", engagementId)
    .order("due_at", { ascending: true })
    .order("created_at", {
      ascending: true,
      referencedTable: "checkpoint_evidence",
    })
    .order("created_at", {
      ascending: true,
      referencedTable: "checkpoint_evidence.proof_files",
    });
  if (error) throw new Error(`checkpoints lookup failed (${error.code})`);

  const urls = await proofFileUrls(
    data.flatMap((row) =>
      row.checkpoint_evidence.flatMap((e) =>
        e.proof_files.map((file) => file.path),
      ),
    ),
  );
  const rows = data.map((row): HireCheckpoint => ({
    id: row.id,
    kind: row.kind === "kickoff" ? "kickoff" : "progress",
    dueAt: row.due_at,
    status: row.status as CheckpointStatus,
    skipReason:
      row.skip_reason === "started_after" || row.skip_reason === "too_soon"
        ? row.skip_reason
        : null,
    evidenceAt: row.evidence_at,
    evidence: row.checkpoint_evidence.map((e) => {
      const metrics = parseMetrics(e.metrics);
      return {
        id: e.id,
        createdAt: e.created_at,
        note: e.note,
        links: e.links,
        metrics: metrics.ok ? metrics.metrics : null,
        capturedOn: e.captured_on,
        periodFrom: e.period_from,
        periodTo: e.period_to,
        confirmedBrief: e.confirmed_brief,
        confirmedStarted: e.confirmed_started,
        late: e.late,
        files: e.proof_files.flatMap((file) => {
          const url = urls.get(file.path);
          return url ? [{ url }] : [];
        }),
      };
    }),
  }));
  // The kickoff is due two days in, so by date alone it would sit among the checkpoints.
  return rows.sort((a, b) =>
    a.kind === b.kind
      ? a.dueAt.localeCompare(b.dueAt)
      : a.kind === "kickoff"
        ? -1
        : 1,
  );
}

export type CheckpointEventName =
  | "applied"
  | "skipped"
  | "kickoff_submitted"
  | "evidence_submitted"
  | "evidence_late"
  | "reminded"
  | "overdue"
  | "warned"
  | "dispute_available"
  | "closed";

export type CheckpointEventView = {
  id: string;
  hireCheckpointId: string | null;
  event: CheckpointEventName;
  /** Null when the system did it. */
  actor: string | null;
  detail: Record<string, Json | undefined>;
  createdAt: string;
};

/** The trail for a hire, oldest first. */
export async function listCheckpointEvents(
  engagementId: string,
): Promise<CheckpointEventView[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("checkpoint_events")
    .select("id, hire_checkpoint_id, event, actor, detail, created_at")
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`checkpoint trail failed (${error.code})`);
  return data.map((row) => ({
    id: row.id,
    hireCheckpointId: row.hire_checkpoint_id,
    event: row.event as CheckpointEventName,
    actor: row.actor,
    detail:
      typeof row.detail === "object" &&
      row.detail !== null &&
      !Array.isArray(row.detail)
        ? row.detail
        : {},
    createdAt: row.created_at,
  }));
}

/** The creator confirms the kickoff: brief read, work started. */
export async function submitKickoff(
  engagementId: string,
  input: {
    confirmedBrief: boolean;
    confirmedStarted: boolean;
    note: string | null;
    fileIds: string[];
  },
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("submit_kickoff", {
    engagement: engagementId,
    confirmed_brief: input.confirmedBrief,
    confirmed_started: input.confirmedStarted,
    note: nullable<string>(input.note),
    file_ids: input.fileIds,
  });
  if (error) return refused(error, "submit kickoff");
  return { ok: true, value: data };
}

/** The creator sends evidence for one progress checkpoint of their hire. */
export async function submitCheckpoint(
  hireCheckpointId: string,
  input: {
    note: string | null;
    links: string[];
    metrics: Metrics | null;
    capturedOn: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    fileIds: string[];
  },
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("submit_checkpoint", {
    hire_checkpoint: hireCheckpointId,
    note: nullable<string>(input.note),
    links: input.links,
    metrics: nullable<Json>(input.metrics),
    captured_on: nullable<string>(input.capturedOn),
    period_from: nullable<string>(input.periodFrom),
    period_to: nullable<string>(input.periodTo),
    file_ids: input.fileIds,
  });
  if (error) return refused(error, "submit checkpoint");
  return { ok: true, value: data };
}
