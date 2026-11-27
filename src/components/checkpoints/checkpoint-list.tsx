import { Check, ChevronDown, Clock, Lock, Minus } from "lucide-react";

import { ProofLinks, ProofShots } from "@/components/engagement/proof-list";
import { formatDay } from "@/lib/campaign";
import {
  checkpointChip,
  checkpointOpensAt,
  checkpointProgress,
  dueText,
  dueWhen,
  isLocked,
  metricsText,
  nextRowId,
  numberRows,
  type ChipTone,
} from "@/lib/checkpoint-words";
import type { EvidenceFormState } from "@/lib/checkpoint-form";
import {
  EVIDENCE_LABELS,
  lagosDate,
  type EvidenceType,
} from "@/lib/checkpoints";
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
  next: "bg-brand-lilac",
  info: "bg-surface-soft ring-1 ring-hairline",
  attention: "bg-attention ring-1 ring-attention-ring",
  muted: "bg-surface-soft text-muted",
};

type Action = (
  previous: EvidenceFormState,
  form: FormData,
) => Promise<EvidenceFormState>;

type Step = "done" | "overdue" | "next" | "upcoming" | "ended";

/** Where a row sits on the stepper, from its status and chip. */
function stepOf(row: HireCheckpoint, tone: ChipTone): Step {
  if (row.status === "done" || row.status === "done_late") return "done";
  if (row.status === "skipped" || row.status === "closed") return "ended";
  if (tone === "attention") return "overdue";
  return tone === "next" ? "next" : "upcoming";
}

const DOT: Record<Step, string> = {
  done: "bg-brand-mint text-brand-green",
  overdue: "bg-attention text-ink ring-1 ring-attention-ring",
  next: "bg-brand-violet text-white ring-4 ring-brand-lilac",
  upcoming: "bg-surface ring-1 ring-hairline-strong",
  ended: "bg-surface-soft text-muted ring-1 ring-hairline",
};

const SEGMENT: Record<Step, string> = {
  done: "bg-brand-green",
  overdue: "bg-attention-ring",
  next: "bg-brand-violet",
  upcoming: "bg-surface-card",
  ended: "bg-hairline-strong",
};

/**
 * A hire's kickoff and checkpoints as a stepper: a progress strip with what is
 * next, then one row per checkpoint with its status, due date and evidence.
 * Every row still waiting is `due` in the database, however far away; here
 * only the next one (or one within a day) reads as due, the rest as upcoming.
 * The creator gets the form open on the next row and can add more on rows
 * already done. A checkpoint still to come opens for evidence only the day
 * before its due day (Lagos), so later ones say when they open instead of
 * offering a form; the kickoff is open from the start. The business and
 * admins read it as it is. Figures are
 * labelled as self-reported. Wording never suggests money is at stake: a
 * missed checkpoint holds nothing back.
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
  const nextId = nextRowId(rows);
  const steps = numberRows(rows).map((row) => {
    const chip = checkpointChip(row, now, row.id === nextId);
    return { row, chip, step: stepOf(row, chip.tone) };
  });
  const progress = checkpointProgress(rows);
  const next = steps.find((s) => s.row.id === nextId);
  const creator = viewer === "creator";

  return (
    <div>
      <div className="space-y-3 border-b border-hairline px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <p className="text-body">
            {next ? (
              <>
                <span className="font-semibold text-ink">
                  {next.step === "overdue" ? "Waiting on" : "Up next"}:{" "}
                  {next.row.title}
                </span>
                , due {dueText(next.row)} ({dueWhen(next.row, now)})
              </>
            ) : progress.done === progress.total ? (
              <span className="font-semibold text-ink">
                All checkpoints are in.
              </span>
            ) : (
              <span className="font-semibold text-ink">
                No checkpoints are waiting.
              </span>
            )}
          </p>
          <p className="text-muted tabular-nums">
            {progress.done} of {progress.total} done
          </p>
        </div>
        <ol aria-hidden="true" className="flex gap-1">
          {steps
            .filter((s) => s.row.status !== "skipped")
            .map((s) => (
              <li
                key={s.row.id}
                className={cn("h-1.5 flex-1 rounded-full", SEGMENT[s.step])}
              />
            ))}
        </ol>
        {creator && required.length > 0 && (
          <p className="text-sm text-muted">
            Each checkpoint needs:{" "}
            {required
              .map((type) => EVIDENCE_LABELS[type].toLowerCase())
              .join(", ")}
            . Sending late is fine, and a missed checkpoint never holds back
            money.
          </p>
        )}
      </div>

      <ol className="py-2">
        {steps.map(({ row, chip, step }, index) => {
          const isNext = row.id === nextId;
          const waiting = row.status === "due" || row.status === "overdue";
          const locked = isLocked(row, now);
          const opensAt = checkpointOpensAt(row);
          const canForm =
            creator &&
            canSend &&
            !locked &&
            row.status !== "skipped" &&
            row.status !== "closed";
          // The next row and anything overdue get the full form panel; the
          // rest offer it as a quiet link.
          const prominent = waiting && (isNext || step === "overdue");
          const last = index === steps.length - 1;
          return (
            <li
              key={row.id}
              className={cn(
                "relative flex gap-3 px-4 py-3 text-sm sm:px-5",
                isNext && "bg-surface-soft/60",
              )}
            >
              {!last && (
                <span
                  aria-hidden="true"
                  className="absolute top-9 -bottom-3 left-[27.5px] w-px bg-hairline-strong sm:left-[31.5px]"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid size-6 shrink-0 place-items-center rounded-full",
                  DOT[step],
                )}
              >
                {step === "done" && (
                  <Check className="size-3.5" strokeWidth={3} />
                )}
                {step === "overdue" && (
                  <Clock className="size-3.5" strokeWidth={2.5} />
                )}
                {step === "next" && (
                  <span className="size-2 rounded-full bg-white" />
                )}
                {step === "ended" && (
                  <Minus className="size-3.5" strokeWidth={2.5} />
                )}
              </span>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex min-h-6 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h3
                    className={cn(
                      "font-semibold",
                      step === "upcoming" || step === "ended"
                        ? "text-body"
                        : "text-ink",
                    )}
                  >
                    {row.title}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold text-ink",
                      CHIP[chip.tone],
                    )}
                  >
                    {chip.label}
                  </span>
                  <span className="text-muted sm:ml-auto">
                    Due {dueText(row)}
                    {waiting && ` · ${dueWhen(row, now)}`}
                  </span>
                </div>
                {row.kind === "kickoff" && waiting && (
                  <p className="text-muted">
                    {creator
                      ? "Confirm you’ve read the brief and started, or scheduled, the work."
                      : "The creator confirms they’ve read the brief and started the work."}
                  </p>
                )}
                {chip.detail && <p className="text-muted">{chip.detail}</p>}
                {creator && canSend && locked && opensAt && (
                  <p className="flex items-center gap-1.5 text-muted">
                    <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                    Opens for evidence on {formatDay(lagosDate(opensAt))}
                  </p>
                )}

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
                    open={isNext}
                    className={cn(
                      "group",
                      prominent &&
                        "rounded-card bg-surface ring-1 ring-hairline",
                    )}
                  >
                    <summary
                      className={cn(
                        "flex cursor-pointer list-none items-center gap-1.5 font-semibold [&::-webkit-details-marker]:hidden",
                        prominent
                          ? "justify-between px-4 py-3 text-ink"
                          : "w-fit text-brand-violet hover:underline",
                      )}
                    >
                      {!waiting
                        ? "Add more"
                        : step === "upcoming"
                          ? "Send early"
                          : "Send evidence"}
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div
                      className={cn(
                        prominent
                          ? "border-t border-hairline p-4"
                          : "mt-3 rounded-card bg-surface p-4 ring-1 ring-hairline",
                      )}
                    >
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
              </div>
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
    <div className="space-y-2 rounded-xl bg-surface p-3 ring-1 ring-hairline">
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
