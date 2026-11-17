import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DisputeThread } from "@/components/engagement/dispute-thread";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { getEngagementDetails } from "@/lib/db/applications";
import { getDispute, getLatestDisputeId } from "@/lib/db/disputes";
import { listSubmissions } from "@/lib/db/submissions";

import { addStatementAction, withdrawDisputeAction } from "./actions";

export const metadata: Metadata = { title: "Dispute" };

// Addressed by the hire, because that is where notifications link; it shows
// the newest dispute on the hire, open or closed.
export default async function HireDisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("business");
  const { id } = await params;
  const hire = await getEngagementDetails(id);
  if (!hire || hire.business.id !== user.id) notFound();
  const disputeId = await getLatestDisputeId(hire.id);
  if (!disputeId) notFound();
  const [dispute, rounds] = await Promise.all([
    getDispute(disputeId),
    listSubmissions(hire.id),
  ]);
  if (!dispute) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Dispute"
        crumbs={[
          { href: "/business/board", label: "Hiring board" },
          {
            href: `/business/engagements/${hire.id}`,
            label: hire.creator.name,
          },
        ]}
        lead={`About “${hire.campaign.title}”, with ${hire.creator.name}.`}
      />
      <DisputeThread
        dispute={dispute}
        hire={hire}
        rounds={rounds}
        viewer={{ id: user.id, role: "business" }}
        statementAction={addStatementAction}
        withdrawAction={withdrawDisputeAction}
      />
    </div>
  );
}
