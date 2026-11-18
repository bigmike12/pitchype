import { ProofLinks, ProofShots } from "@/components/engagement/proof-list";
import { formatDateTime } from "@/lib/creator-profile";
import type { ClickProofView } from "@/lib/db/click-proofs";

/**
 * Where a per-click creator posted their link, oldest first. For the record
 * only: nobody reviews it. Rows only (no frame): put it in a `SectionCard`.
 */
export function ClickProofList({ proofs }: { proofs: ClickProofView[] }) {
  return (
    <ol className="divide-y divide-hairline">
      {proofs.map((proof, index) => (
        <li key={proof.id} className="space-y-3 px-4 py-4 text-sm sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-semibold text-ink">Post {index + 1}</p>
            <time dateTime={proof.createdAt} className="text-muted">
              {formatDateTime(proof.createdAt)}
            </time>
          </div>
          <ProofLinks links={proof.links} />
          <ProofShots files={proof.files} label={`post ${index + 1}`} />
          {proof.note && (
            <p className="whitespace-pre-line text-body">{proof.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
