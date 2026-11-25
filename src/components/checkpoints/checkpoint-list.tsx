import { ProofLinks, ProofShots } from "@/components/engagement/proof-list";
import { formatDay } from "@/lib/campaign";
import {
  checkpointChip,
  dueText,
  metricsText,
  numberRows,
  type ChipTone,
} from "@/lib/checkpoint-words";
import type { EvidenceFormState } from "@/lib/checkpoint-form";
import { EVIDENCE_LABELS, type EvidenceType } from "@/lib/checkpoints";
import { formatDateTime, type Platform } from "@/lib/creator-profile";
import type {
  CheckpointEvidenceView,
  HireCheckpoint,
} from "@/lib/db/checkpoints";
import { cn } from "@/lib/utils";

import { CheckpointForm } from "./checkpoint-form";
import { KickoffForm } from "./kickoff-form";

const CHIP: Record<ChipTone, string> = {
  success: "bg-brand-mint",
  info: "bg-surface-soft ring-1 ring-hairline",
  attention: "bg-attention ring-1 ring-attention-ring",
  muted: "bg-surface-soft text-muted",
};

type Action = (
  previous: EvidenceFormState,
  form: FormData,
) => Promise<EvidenceFormState>;

/**
 * A hire's kickoff and checkpoints, each with its due date, status chip and
 * the evidence sent. The creator also gets a form on each one that is still
 * waiting (and can add more to one that's done); the business and admins read
 * it as it is. Figures are labelled as self-reported. Wording never suggests
 * money is at stake: a missed checkpoint holds nothing back.
 */
export function CheckpointList({
  rows,
  viewer,
  engagementId,
  required,
  platforms,
  now,
  canSend,
  kickoffAction,
  checkpointAction,
}: {
  rows: HireCheckpoint[];
  viewer: "creator" | "business" | "admin";
  engagementId: string;
  /** What each progress checkpoint needs, from the campaign. */
  required: EvidenceType[];
  /** The platforms the job posts on, for the analytics fields. */
  platforms: Platform[];
  now: Date;
  /** Creator only: the job is still running, so evidence can be added. */
  canSend: boolean;
  kickoffAction?: Action;
  checkpointAction?: Action;
}) {
  const numbered = numberRows(rows);
  // The first thing waiting is the one to open.
  const firstWaiting = numbered.find(
    (r) => r.status === "due" || r.status === "overdue",
  )?.id;

  return (
    <div>
      {viewer === "creator" && required.length > 0 && (
        <p className="border-b border-hairline px-4 py-3 text-sm text-body sm:px-5">
          Each checkpoint needs:{" "}
          {required
            .map((type) => EVIDENCE_LABELS[type].toLowerCase())
            .join(", ")}
          . Sending it late is fine, and no money is held back because of a
          missed checkpoint.
        </p>
      )}
      <ol className="divide-y divide-hairline">
        {numbered.map((row) => {
          const chip = checkpointChip(row, now);
          const waiting = row.status === "due" || row.status === "overdue";
          const canForm =
            viewer === "creator" &&
            canSend &&
            (waiting || row.status === "done" || row.status === "done_late");
          return (
            <li key={row.id} className="space-y-3 px-4 py-4 text-sm sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="font-semibold text-ink">{row.title}</h3>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink",
                    CHIP[chip.tone],
                  )}
                >
                  {chip.label}
                </span>
                <span className="text-muted">Due {dueText(row)}</span>
              </div>
              {chip.detail && <p className="text-muted">{chip.detail}</p>}

              {row.evidence.map((entry) => (
                <Evidence
                  key={entry.id}
                  entry={entry}
                  kickoff={row.kind === "kickoff"}
                  viewer={viewer}
                />
              ))}

              {canForm && (
                <details
                  open={row.id === firstWaiting}
                  className="rounded-card bg-canvas p-4 ring-1 ring-hairline"
                >
                  <summary className="cursor-pointer font-semibold text-ink">
                    {waiting ? "Send evidence" : "Add more"}
                  </summary>
                  <div className="mt-4">
                    {row.kind === "kickoff" && kickoffAction ? (
                      <KickoffForm
                        engagementId={engagementId}
                        action={kickoffAction}
                      />
                    ) : (
                      row.kind === "progress" &&
                      checkpointAction && (
                        <CheckpointForm
                          hireCheckpointId={row.id}
                          required={required}
                          platforms={platforms}
                          action={checkpointAction}
                        />
                      )
                    )}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Evidence({
  entry,
  kickoff,
  viewer,
}: {
  entry: CheckpointEvidenceView;
  kickoff: boolean;
  viewer: "creator" | "business" | "admin";
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <p className="text-muted">
        Sent{" "}
        <time dateTime={entry.createdAt}>
          {formatDateTime(entry.createdAt)}
        </time>
        {entry.late ? " (after it was due)" : ""}
      </p>
      {kickoff && (
        <p className="text-body">
          Confirmed: read the brief, and started or scheduled the work.
        </p>
      )}
      {entry.note && (
        <p className="whitespace-pre-line text-body">{entry.note}</p>
      )}
      <ProofLinks links={entry.links} />
      <ProofShots files={entry.files} label="checkpoint" />
      {entry.metrics && (
        <div>
          <p className="font-semibold text-ink">
            {viewer === "creator"
              ? "Reported by you"
              : "Reported by the creator"}
            {entry.capturedOn
              ? ` · captured ${formatDay(entry.capturedOn)}`
              : ""}
            {entry.periodFrom && entry.periodTo
              ? ` · ${formatDay(entry.periodFrom)} to ${formatDay(entry.periodTo)}`
              : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-body">
            {metricsText(entry.metrics)}
          </p>
        </div>
      )}
    </div>
  );
}
