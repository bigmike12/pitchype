import {
  BadgeCheck,
  Banknote,
  EyeOff,
  Flag,
  Gavel,
  LockKeyhole,
  Megaphone,
  ShieldAlert,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  Skeleton,
} from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import {
  listCampaignsForReview,
  listOpenCampaignReports,
} from "@/lib/db/campaigns";
import { countOpenDisputes } from "@/lib/db/disputes";
import { getStandingReview } from "@/lib/db/moderation";
import { countEscrowEngagements } from "@/lib/db/money";
import { countPayoutsAwaitingApproval } from "@/lib/db/payouts";
import { listHiddenCreators, listOpenReports } from "@/lib/db/reports";
import { listVerificationQueue } from "@/lib/db/verification";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-28 rounded-card" />
              ))}
            </div>
          </PageLoading>
        }
      >
        <Overview />
      </Suspense>
    </div>
  );
}

// The admin area's front page: how much waits in each queue, each figure a
// link to the page that handles it. Nothing is decided here.
async function Overview() {
  await requireRole("admin");
  const [
    standing,
    campaignsToReview,
    queue,
    reports,
    campaignReports,
    hidden,
    payouts,
    escrow,
    disputes,
  ] = await Promise.all([
    getStandingReview(),
    listCampaignsForReview(),
    listVerificationQueue(),
    listOpenReports(),
    listOpenCampaignReports(),
    listHiddenCreators(),
    countPayoutsAwaitingApproval(),
    countEscrowEngagements(),
    countOpenDisputes(),
  ]);

  return (
    <>
      <PageHeader
        title="Admin"
        lead="What is waiting on an admin. Each figure opens the page that handles it."
      />

      <h2 className="mb-3 text-[0.9375rem] font-semibold text-ink">Review</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Appeals and suspensions"
          value={String(standing.appeals.length + standing.suspended.length)}
          detail={`${standing.appeals.length} ${standing.appeals.length === 1 ? "appeal" : "appeals"}, ${standing.suspended.length} suspended`}
          icon={ShieldAlert}
          tone="rose"
          href="/admin/standing"
        />
        <StatCard
          label="Campaigns to review"
          value={String(campaignsToReview.length)}
          detail="First campaigns waiting"
          icon={Megaphone}
          tone="sun"
          href="/admin/campaigns"
        />
        <StatCard
          label="Handles to verify"
          value={String(queue.length)}
          detail="Oldest first"
          icon={BadgeCheck}
          tone="sky"
          href="/admin/verification"
        />
        <StatCard
          label="Open reports"
          value={String(reports.length + campaignReports.length)}
          detail={`${reports.length} on creators, ${campaignReports.length} on campaigns`}
          icon={Flag}
          tone="peach"
          href="/admin/reports"
        />
        <StatCard
          label="Hidden profiles"
          value={String(hidden.length)}
          detail="Out of the directory"
          icon={EyeOff}
          tone="lilac"
          href="/admin/hidden"
        />
      </div>

      <h2 className="mt-6 mb-3 text-[0.9375rem] font-semibold text-ink">
        Money
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Payouts to approve"
          value={String(payouts)}
          detail={payouts > 0 ? "Review and approve" : "See all payouts"}
          icon={Banknote}
          tone="mint"
          href="/admin/money/payouts"
        />
        <StatCard
          label="Hires in escrow"
          value={String(escrow)}
          detail="Paid for, not settled yet"
          icon={LockKeyhole}
          tone="lilac"
          href="/admin/money/escrow"
        />
        <StatCard
          label="Open disputes"
          value={String(disputes)}
          detail={disputes > 0 ? "Read and decide" : "Oldest first"}
          icon={Gavel}
          tone="rose"
          href="/admin/disputes"
        />
      </div>
    </>
  );
}
