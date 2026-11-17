import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DisputeThread } from "@/components/engagement/dispute-thread";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { requireRole } from "@/lib/auth";
import { getEngagementDetails } from "@/lib/db/applications";
import { getDispute } from "@/lib/db/disputes";
import { getEscrowEngagement } from "@/lib/db/money";
import { listSubmissions } from "@/lib/db/submissions";

import { addAdminStatementAction } from "../actions";
import { DecideForm } from "../decide-form";

export const metadata: Metadata = { title: "Dispute" };

export default async function AdminDisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin");
  const { id } = await params;
  const dispute = await getDispute(id);
  if (!dispute) notFound();
  const [hire, rounds] = await Promise.all([
    getEngagementDetails(dispute.engagementId),
    listSubmissions(dispute.engagementId),
  ]);
  if (!hire) notFound();
  // The fee snapshot and the funding charge the decision is previewed from.
  const escrow =
    dispute.status === "open" ? await getEscrowEngagement(hire.id) : null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Dispute"
        crumbs={[{ href: "/admin/disputes", label: "Disputes" }]}
        lead={`“${hire.campaign.title}”: ${hire.business.name} hired ${hire.creator.name}.`}
        actions={
          <Link
            href={`/admin/money/engagements/${hire.id}`}
            className="link inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Money trail
          </Link>
        }
      />
      <DisputeThread
        dispute={dispute}
        hire={hire}
        rounds={rounds}
        viewer={{ id: user.id, role: "admin" }}
        statementAction={addAdminStatementAction}
      />
      {dispute.status === "open" && (
        <SectionCard
          id="decide-title"
          title="Decide this dispute"
          anchor="decide"
          padded
          className="mt-4"
        >
          {escrow &&
          escrow.businessFeeKobo !== null &&
          escrow.creatorFeeBps !== null &&
          escrow.creatorMinFeeKobo !== null ? (
            <DecideForm
              disputeId={dispute.id}
              facts={{
                agreedPriceKobo: escrow.agreedPriceKobo,
                businessFeeKobo: escrow.businessFeeKobo,
                creatorFeeBps: escrow.creatorFeeBps,
                creatorMinFeeKobo: escrow.creatorMinFeeKobo,
                paystackChargeKobo: escrow.paystackChargeKobo,
              }}
            />
          ) : (
            <p className="text-sm text-danger">
              This hire’s escrow or fee details can’t be read, so it can’t be
              decided here. Open its money trail.
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}
