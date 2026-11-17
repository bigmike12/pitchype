import { formatDateTime } from "@/lib/creator-profile";
import type { SubmissionStatus, SubmissionView } from "@/lib/db/submissions";

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
 * Links open in a new tab and carry no ranking weight (`nofollow`), because
 * anyone can type any link; screenshots are signed URLs that stop working
 * after ten minutes.
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

          {round.links.length > 0 && (
            <ul className="space-y-1">
              {round.links.map((link) => (
                <li key={link} className="min-w-0">
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="link break-all"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {round.files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {round.files.map((file, index) => (
                <li key={file.url}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="block overflow-hidden rounded-lg border border-hairline"
                  >
                    {/* A short-lived signed URL: next/image would cache and
                        re-serve it past its expiry. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.url}
                      alt={`Screenshot ${index + 1} of round ${round.round}`}
                      width={96}
                      height={96}
                      loading="lazy"
                      className="size-24 object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}

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
