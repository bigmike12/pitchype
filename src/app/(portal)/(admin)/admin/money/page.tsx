import { Banknote, ReceiptText, Scale, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  getLatestReconciliation,
  countEscrowEngagements,
} from "@/lib/db/money";
import { countPayoutsAwaitingApproval } from "@/lib/db/payouts";

import { Reconciliation } from "./reconciliation-callout";

export const metadata: Metadata = { title: "Money" };

export default function MoneyPage() {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton />
            <PanelSkeleton lines={2} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-card" />
              ))}
            </div>
          </PageLoading>
        }
      >
        <Money />
      </Suspense>
    </div>
  );
}

// The money area's front page: whether the books agree, and a way into each
// job (approve payouts, settle escrow, read the ledger, see past checks).
async function Money() {
  await requireRole("admin");
  const [reconciliation, waiting, escrow] = await Promise.all([
    getLatestReconciliation(),
    countPayoutsAwaitingApproval(),
    countEscrowEngagements(),
  ]);

  return (
    <>
      <PageHeader
        title="Money"
        lead="Whether the ledger agrees with Paystack, and what is waiting on an admin."
      />

      <Reconciliation run={reconciliation} />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard
          label="Payouts to approve"
          value={String(waiting)}
          detail={waiting > 0 ? "Review and approve" : "See all payouts"}
          icon={Banknote}
          tone="mint"
          href="/admin/money/payouts"
        />
        <StatCard
          label="Hires in escrow"
          value={String(escrow)}
          detail="Paid for, not settled yet"
          icon={ShieldCheck}
          tone="lilac"
          href="/admin/money/escrow"
        />
        <StatCard
          label="Ledger"
          value="Every line"
          detail="Filters and a CSV export"
          icon={ReceiptText}
          tone="sky"
          href="/admin/money/ledger"
        />
        <StatCard
          label="Reconciliation"
          value={
            reconciliation ? formatDateTime(reconciliation.ranAt) : "Never"
          }
          detail="Last check against Paystack"
          icon={Scale}
          tone="sun"
          href="/admin/money/reconciliation"
        />
      </div>
    </>
  );
}
