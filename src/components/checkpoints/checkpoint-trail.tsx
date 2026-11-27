import { trailEntries, type TrailEntry } from "@/lib/checkpoint-words";
import { formatDateTime } from "@/lib/creator-profile";
import type { CheckpointEventView, HireCheckpoint } from "@/lib/db/checkpoints";
import { cn } from "@/lib/utils";

const DOT: Record<TrailEntry["tone"], string> = {
  success: "bg-brand-green",
  attention: "bg-attention-ring",
  muted: "bg-hairline-strong",
};

/**
 * What happened to a hire's checkpoints, oldest first: which applied when work
 * started (one line), which were skipped, reminders, passed times, warnings,
 * and when evidence came in. Visible to both people and admins. Rows only:
 * put it in a `SectionCard`.
 */
export function CheckpointTrail({
  events,
  rows,
}: {
  events: CheckpointEventView[];
  rows: HireCheckpoint[];
}) {
  const entries = trailEntries(events, rows);
  if (entries.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted sm:px-5">
        Nothing has happened yet.
      </p>
    );
  }
  return (
    <ol className="py-2">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className="relative flex gap-3 px-4 py-2.5 text-sm sm:px-5"
        >
          {index < entries.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute top-6 -bottom-2.5 left-[19.5px] w-px bg-hairline sm:left-[23.5px]"
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "relative mt-1.5 size-2 shrink-0 rounded-full",
              DOT[entry.tone],
            )}
          />
          <div className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-4 gap-y-0.5">
            <span className="text-body">{entry.text}</span>
            <time dateTime={entry.createdAt} className="text-muted">
              {formatDateTime(entry.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
