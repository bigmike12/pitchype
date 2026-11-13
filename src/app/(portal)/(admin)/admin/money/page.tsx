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
  listReconciliationRuns,
  type EscrowEngagement,
  type ReconciliationRun,
} from "@/lib/db/money";
import { countPayoutsAwaitingApproval } from "@/lib/db/payouts";
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
  const [reconciliation, runs, waiting, escrow] = await Promise.all([
    getLatestReconciliation(),
    listReconciliationRuns(RUNS_SHOWN),
    countPayoutsAwaitingApproval(),
    listEscrowEngagements(),
  ]);

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
          In escrow ({escrow.hires.length}
          {escrow.more && "+"})
        </h2>
        <p className="mt-2 max-w-xl">
          Hires that are paid for and not settled yet. Settle one only when the
          creator or business can’t finish it themselves; every settlement needs
          a written reason.
        </p>
        {escrow.hires.length === 0 ? (
          <p className="mt-4 text-muted">Nothing is in escrow.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {escrow.hires.map((hire) => (
              <EscrowItem key={hire.id} hire={hire} />
            ))}
          </ul>
        )}
      </section>

      <RecentRuns runs={runs} />

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

const RUNS_SHOWN = 30;

const th = "px-4 py-3 text-[0.8125rem] font-medium text-muted";

/** A difference, signed, with a word so it never relies on colour alone. */
function Difference({ kobo }: { kobo: number }) {
  if (kobo === 0) return <span className="text-muted">None</span>;
  return (
    <span className="font-semibold text-danger tabular-nums">
      {kobo < 0 ? "−" : "+"}
      {formatNaira(Math.abs(kobo))}
      <span className="font-normal"> (differs)</span>
    </span>
  );
}

/**
 * The last comparisons of the ledger with Paystack's balance, so a difference
 * that appears, grows or clears is visible over time (spec §12). A stacked
 * list on phones, a table from 640px, like the ledger tables.
 */
function RecentRuns({ runs }: { runs: ReconciliationRun[] }) {
  if (runs.length === 0) return null;
  return (
    <section aria-labelledby="runs-title" className="mt-10">
      <h2 id="runs-title" className="text-display-md">
        Recent comparisons
      </h2>
      <p className="mt-2 max-w-xl">
        Each daily check of the ledger against Paystack’s balance, newest first,
        in Lagos time. Difference is Paystack’s balance minus what the ledger
        expects.
      </p>

      <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-card panel sm:hidden">
        {runs.map((run) => (
          <li key={run.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">
                {formatDateTime(run.ranAt)}
              </p>
              <Difference kobo={run.differenceKobo} />
            </div>
            <p className="mt-1 text-sm text-muted">
              Paystack {formatNaira(run.paystackBalanceKobo)} · expected{" "}
              {formatNaira(run.expectedCashKobo)}
            </p>
            {run.note && (
              <p className="mt-1 text-sm break-words text-ink">{run.note}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 hidden overflow-x-auto rounded-card panel sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-surface-soft/60">
            <tr>
              <th scope="col" className={th}>
                Checked
              </th>
              <th scope="col" className={`${th} text-right`}>
                Paystack balance
              </th>
              <th scope="col" className={`${th} text-right`}>
                Expected cash
              </th>
              <th scope="col" className={`${th} text-right`}>
                Difference
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline text-ink">
            {runs.map((run) => (
              <tr key={run.id} className="align-top">
                <th
                  scope="row"
                  className="px-4 py-3 font-normal whitespace-nowrap"
                >
                  {formatDateTime(run.ranAt)}
                  {run.note && (
                    <span className="block max-w-xs text-[0.8125rem] break-words whitespace-normal text-muted">
                      {run.note}
                    </span>
                  )}
                </th>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {formatNaira(run.paystackBalanceKobo)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {formatNaira(run.expectedCashKobo)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Difference kobo={run.differenceKobo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
