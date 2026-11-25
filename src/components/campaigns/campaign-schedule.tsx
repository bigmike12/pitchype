import { CampaignTimeline } from "@/components/campaigns/campaign-timeline";
import {
  EVIDENCE_LABELS,
  FINAL_REQUIREMENT_LABELS,
  type EvidenceType,
  type FinalRequirement,
} from "@/lib/checkpoints";

/**
 * A campaign's timeline and what it asks of creators on the way: the progress
 * bar, the checkpoint rhythm and what each one needs, and what the final
 * submission must contain. Shown to creators before they apply, and to the
 * business and admins, so nobody is surprised later.
 */
export function CampaignSchedule({
  start,
  liveFrom,
  deliverBy,
  endsOn,
  today,
  checkpointsEnabled,
  checkpointIntervalDays,
  checkpointEvidence,
  checkpointDates,
  finalRequirements,
}: {
  start: string | null;
  liveFrom: string;
  deliverBy: string;
  endsOn: string | null;
  today: string;
  checkpointsEnabled: boolean;
  checkpointIntervalDays: number | null;
  checkpointEvidence: EvidenceType[];
  checkpointDates: string[];
  finalRequirements: FinalRequirement[];
}) {
  return (
    <div className="space-y-5">
      <CampaignTimeline
        start={start}
        liveFrom={liveFrom}
        deliverBy={deliverBy}
        endsOn={endsOn}
        checkpoints={checkpointDates}
        today={today}
      />
      {endsOn && (
        <p className="text-sm text-muted">
          Keep your posts up until the campaign ends.
        </p>
      )}
      {checkpointsEnabled && (
        <div className="text-sm">
          <h3 className="font-semibold text-ink">
            Checkpoints
            {checkpointIntervalDays
              ? ` every ${checkpointIntervalDays} days`
              : ""}
          </h3>
          <p className="mt-1 text-body">
            You confirm a kickoff two days after you start work, then show
            progress on fixed dates:{" "}
            {checkpointEvidence
              .map((type) => EVIDENCE_LABELS[type].toLowerCase())
              .join(", ")}
            . If you start late, only the checkpoints at least 3 days after your
            start apply. Sending one late is fine, and no money is held back
            because of a missed checkpoint.
          </p>
        </div>
      )}
      {finalRequirements.length > 0 && (
        <div className="text-sm">
          <h3 className="font-semibold text-ink">The final submission needs</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-body">
            {finalRequirements.map((r) => (
              <li key={r}>{FINAL_REQUIREMENT_LABELS[r]}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
