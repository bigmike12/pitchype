import {
  Banknote,
  ReceiptText,
  Repeat,
  Scale,
  ShieldCheck,
} from "lucide-react";
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
  countEscrowEngagements,
  getActivePaymentProvider,
  getLatestReconciliation,
} from "@/lib/db/money";
import { countPayoutsAwaitingApproval } from "@/lib/db/payouts";
import { providerName } from "@/lib/provider-words";

import { CashMovementForm } from "./cash-movement-form";
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
  const [cray, paystack, active, waiting, escrow] = await Promise.all([
    getLatestReconciliation("cray"),
    getLatestReconciliation("paystack"),
    getActivePaymentProvider(),
    countPayoutsAwaitingApproval(),
    countEscrowEngagements(),
  ]);
  // The active provider's check always shows; the other only once it has run
  // (Paystack money is still there to reconcile after the switch).
  const reconciliations = [
    { provider: "cray" as const, run: cray },
    { provider: "paystack" as const, run: paystack },
  ].filter(({ provider, run }) => provider === active || run !== null);
  const latest = [cray, paystack]
    .filter((run) => run !== null)
    .sort((a, b) => Date.parse(b.ranAt) - Date.parse(a.ranAt))[0];

  return (
    <>
      <PageHeader
        title="Money"
        lead="Whether the ledger agrees with each payment provider, and what is waiting on an admin."
      />

      <div className="space-y-3">
        {reconciliations.map(({ provider, run }) => (
          <Reconciliation key={provider} run={run} provider={provider} />
        ))}
      </div>

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
          value={latest ? formatDateTime(latest.ranAt) : "Never"}
          detail="Last check against a provider"
          icon={Scale}
          tone="sun"
          href="/admin/money/reconciliation"
        />
        <StatCard
          label="Payment provider"
          value={providerName(active)}
          detail="Switch where new payments go"
          icon={Repeat}
          tone="mint"
          href="/admin/money/provider"
        />
      </div>

      <section aria-label="Cash moved" className="mt-6">
        <h2 className="mb-2 text-display-md">Cash moved between places</h2>
        <p className="mb-3 text-sm text-muted">
          If money moves between Paystack, Cray and our bank (a top-up so
          payouts can go out, say), record it here so each provider’s check
          stays true.
        </p>
        <CashMovementForm />
      </section>
    </>
  );
}
