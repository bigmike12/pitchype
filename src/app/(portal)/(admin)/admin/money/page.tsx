import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  getLatestReconciliation,
  listEscrowEngagements,
  type EscrowEngagement,
  type ReconciliationRun,
} from "@/lib/db/money";
import { listPayoutsForReview } from "@/lib/db/payouts";
import { formatNaira } from "@/lib/money";

import { SettleForm } from "./settle-form";

export const metadata: Metadata = { title: "Money" };

export default function MoneyPage() {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton />
            <PanelSkeleton lines={2} />
            <div className="mt-10">
              <SectionTitleSkeleton />
              <div className="space-y-3">
                <PanelSkeleton lines={2} />
                <PanelSkeleton lines={2} />
              </div>
            </div>
          </PageLoading>
        }
      >
        <Money />
      </Suspense>
    </div>
  );
}

async function Money() {
  await requireRole("admin");
  const [reconciliation, payouts, escrow] = await Promise.all([
    getLatestReconciliation(),
    listPayoutsForReview(),
    listEscrowEngagements(),
  ]);
  const waiting = payouts.filter((p) => p.status === "requested").length;

  return (
    <>
      <PageHeader
        title="Money"
        lead="What is held in escrow, payouts waiting for approval, and whether the ledger agrees with Paystack."
      />

      <Reconciliation run={reconciliation} />

      <section aria-labelledby="payouts-title" className="mt-10">
        <h2 id="payouts-title" className="text-display-md">
          Payouts
        </h2>
        <div className="mt-4 flex flex-col gap-3 rounded-card panel p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-ink">
            <span className="font-semibold tabular-nums">{waiting}</span>{" "}
            {waiting === 1 ? "payout is" : "payouts are"} waiting for approval.
          </p>
          <Button asChild variant={waiting > 0 ? "default" : "secondary"}>
            <Link href="/admin/money/payouts">
              {waiting > 0 ? "Review payouts" : "See payouts"}
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="escrow-title" className="mt-10">
        <h2 id="escrow-title" className="text-display-md">
          In escrow ({escrow.length})
        </h2>
        <p className="mt-2 max-w-xl">
          Hires that are paid for and not settled yet. Settle one only when the
          creator or business can’t finish it themselves; every settlement needs
          a written reason.
        </p>
        {escrow.length === 0 ? (
          <p className="mt-4 text-muted">Nothing is in escrow.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {escrow.map((hire) => (
              <EscrowItem key={hire.id} hire={hire} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ledger-title" className="mt-10">
        <h2 id="ledger-title" className="text-display-md">
          Ledger
        </h2>
        <p className="mt-2 max-w-xl">
          Every movement of money, one line each, with filters and a CSV export.
        </p>
        <div className="mt-4">
          <Button asChild variant="secondary">
            <Link href="/admin/money/ledger">Open the ledger</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Reconciliation({ run }: { run: ReconciliationRun | null }) {
  if (!run) {
    return (
      <section
        aria-label="Reconciliation"
        className="rounded-card panel p-4 sm:p-5"
      >
        <p className="text-ink">
          Pitchype hasn’t compared the ledger with Paystack yet.
        </p>
      </section>
    );
  }
  const when = formatDateTime(run.ranAt);
  // The note is only written when the ledger doesn't balance or the figures
  // differ, so either one is a reason to look.
  if (run.differenceKobo !== 0 || run.note !== null) {
    return (
      <Callout
        tone="attention"
        icon={TriangleAlert}
        title={
          run.differenceKobo !== 0
            ? `Pitchype’s ledger and Paystack differ by ${formatNaira(Math.abs(run.differenceKobo))}`
            : "Pitchype’s ledger needs a look"
        }
      >
        <p>
          Checked {when}. Paystack holds {formatNaira(run.paystackBalanceKobo)};
          the ledger expects {formatNaira(run.expectedCashKobo)}.
        </p>
        {run.note && <p className="mt-1">{run.note}</p>}
      </Callout>
    );
  }
  return (
    <Callout
      tone="success"
      icon={CircleCheck}
      title={`Ledger and Paystack agree as of ${when}`}
    />
  );
}

const STATUS_WORDS: Record<EscrowEngagement["status"], string> = {
  funded: "Paid, work not started",
  in_progress: "Work started",
};

function EscrowItem({ hire }: { hire: EscrowEngagement }) {
  // The fee snapshot is written when the hire is funded, so it is always
  // there for a hire in escrow; if it somehow isn't, nothing is settled blind.
  const facts =
    hire.businessFeeKobo !== null &&
    hire.creatorFeeBps !== null &&
    hire.creatorMinFeeKobo !== null
      ? {
          agreedPriceKobo: hire.agreedPriceKobo,
          businessFeeKobo: hire.businessFeeKobo,
          creatorFeeBps: hire.creatorFeeBps,
          creatorMinFeeKobo: hire.creatorMinFeeKobo,
          paystackChargeKobo: hire.paystackChargeKobo,
        }
      : null;
  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-semibold break-words text-ink">
            {hire.campaignTitle}
          </p>
          <p className="text-sm text-muted">
            {hire.businessName} hired {hire.creatorName}
          </p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums text-ink">
          {formatNaira(hire.agreedPriceKobo)}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted">
        {STATUS_WORDS[hire.status]}
        {hire.fundedAt && `, paid ${formatDateTime(hire.fundedAt)}`}
        {hire.startedAt && `, started ${formatDateTime(hire.startedAt)}`}
      </p>
      <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-2">
        {facts ? (
          <SettleForm engagementId={hire.id} facts={facts} />
        ) : (
          <p className="text-sm text-danger">
            This hire’s fee details are missing, so it can’t be settled here.
            Open its trail.
          </p>
        )}
        <Link
          href={`/admin/money/engagements/${hire.id}`}
          className="link inline-flex min-h-11 items-center text-sm font-semibold"
        >
          Money trail
        </Link>
      </div>
    </li>
  );
}
