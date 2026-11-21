import { SectionCard } from "@/components/ui/section-card";
import type { EngagementDetails } from "@/lib/db/applications";
import {
  listCheckpointEvents,
  listHireCheckpoints,
} from "@/lib/db/checkpoints";

import { CheckpointList } from "./checkpoint-list";
import { CheckpointTrail } from "./checkpoint-trail";

/**
 * A hire's kickoff, checkpoints and trail for an admin reading a dispute or
 * a money trail. Nothing on a campaign without checkpoints. Read only.
 */
export async function AdminCheckpoints({
  engagementId,
  campaign,
  className,
}: {
  engagementId: string;
  campaign: EngagementDetails["campaign"];
  className?: string;
}) {
  if (!campaign.checkpointsEnabled) return null;
  const [rows, events] = await Promise.all([
    listHireCheckpoints(engagementId),
    listCheckpointEvents(engagementId),
  ]);
  if (rows.length === 0) return null;
  return (
    <div className={className}>
      <SectionCard id="admin-checkpoints-title" title="Kickoff and checkpoints">
        <CheckpointList
          rows={rows}
          viewer="admin"
          engagementId={engagementId}
          required={campaign.checkpointEvidence}
          platforms={[]}
          now={new Date()}
          canSend={false}
        />
      </SectionCard>
      <SectionCard
        id="admin-checkpoint-trail-title"
        title="Checkpoint trail"
        className="mt-4"
      >
        <CheckpointTrail events={events} rows={rows} />
      </SectionCard>
    </div>
  );
}
