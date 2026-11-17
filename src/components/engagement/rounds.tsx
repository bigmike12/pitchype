import { formatDateTime } from "@/lib/creator-profile";
import type { SubmissionStatus, SubmissionView } from "@/lib/db/submissions";

import { ProofLinks, ProofShots } from "./proof-list";

const STATUS_WORDS: Record<SubmissionStatus, string> = {
  pending_review: "Waiting for review",
  accepted: "Accepted",
  denied: "Sent back",
  auto_accepted: "Released automatically",
};

/**
 * The rounds of proof sent in for one job, in the order given: each round's
 * number and date, its links, screenshots and note, and for a round that was
 * sent back, the reasons. Rows only (no frame): put it in a `SectionCard`.
 */
export function Rounds({ rounds }: { rounds: SubmissionView[] }) {
  return (
    <ol className="divide-y divide-hairline">
      {rounds.map((round) => (
        <li key={round.id} className="space-y-3 px-4 py-4 text-sm sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-semibold text-ink">
              Round {round.round}
              <span className="font-normal text-muted">
                {" "}
                · {STATUS_WORDS[round.status]}
              </span>
            </p>
            <time dateTime={round.createdAt} className="text-muted">
              {formatDateTime(round.createdAt)}
            </time>
          </div>

          <ProofLinks links={round.links} />
          <ProofShots files={round.files} label={`round ${round.round}`} />

          {round.note && (
            <p className="whitespace-pre-line text-body">{round.note}</p>
          )}

          {round.status === "denied" && round.denialReasons.length > 0 && (
            <div className="rounded-xl bg-surface-soft p-3">
              <p className="font-semibold text-ink">Why it was sent back</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-body">
                {round.denialReasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
