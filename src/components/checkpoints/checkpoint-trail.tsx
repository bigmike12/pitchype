import { numberRows, trailText } from "@/lib/checkpoint-words";
import { formatDateTime } from "@/lib/creator-profile";
import type { CheckpointEventView, HireCheckpoint } from "@/lib/db/checkpoints";

/**
 * What happened to a hire's checkpoints, oldest first: when each applied or was
 * skipped, was reminded, passed its time, was warned, and when evidence came
 * in. Visible to both people and admins. Rows only: put it in a `SectionCard`.
 */
export function CheckpointTrail({
  events,
  rows,
}: {
  events: CheckpointEventView[];
  rows: HireCheckpoint[];
}) {
  const titles = new Map(numberRows(rows).map((r) => [r.id, r.title]));
  if (events.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted sm:px-5">
        Nothing has happened yet.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-hairline">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5"
        >
          <span className="text-body">
            {trailText(
              event.event,
              event.detail,
              (event.hireCheckpointId && titles.get(event.hireCheckpointId)) ||
                "A checkpoint",
            )}
          </span>
          <time dateTime={event.createdAt} className="text-muted">
            {formatDateTime(event.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
