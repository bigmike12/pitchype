import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LedgerTable } from "@/components/money/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { listLedger } from "@/lib/db/money";
import { listPayoutsForReview, type PayoutForReview } from "@/lib/db/payouts";
import { formatNaira } from "@/lib/money";
import { adminPayoutStatus } from "@/lib/payout-request";

import { PayoutDecision } from "../payout-decision";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage() {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading payouts…">
            <HeaderSkeleton crumbs />
            <SectionTitleSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={4} />
              <PanelSkeleton lines={4} />
            </div>
            <div className="mt-10">
              <SectionTitleSkeleton />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Payouts />
      </Suspense>
    </div>
  );
}

// How many waiting payouts also get the creator's recent wallet lines inline;
// the rest link to the ledger, so one page never makes dozens of lookups.
const WITH_HISTORY = 25;
const RECENT_LINES = 5;
const DECIDED_SHOWN = 30;

const destination = (p: PayoutForReview) =>
  `${p.bankName} ••••${p.last4} · ${p.accountName}`;

async function Payouts() {
  await requireRole("admin");
  const all = await listPayoutsForReview();
  // Oldest request first: the one that has waited longest is decided first.
  const waiting = all.filter((p) => p.status === "requested").reverse();
  const decided = all
    .filter((p) => p.status !== "requested")
    .slice(0, DECIDED_SHOWN);

  const history = await Promise.all(
    waiting.slice(0, WITH_HISTORY).map(async (p) => {
      const page = await listLedger({ person: p.creatorId, limit: 30 });
      return page.rows
        .filter(
          (r) =>
            r.account === "creator_wallet" && r.ownerUserId === p.creatorId,
        )
        .slice(0, RECENT_LINES);
    }),
  );

  return (
    <>
      <PageHeader
        title="Payouts"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead="Check the bank account and the creator’s recent wallet activity, then approve or reject. Approving sends the money."
      />

      <section aria-labelledby="waiting-title">
        <h2 id="waiting-title" className="text-display-md">
          Waiting for approval ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-4 text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {waiting.map((p, index) => (
              <li key={p.id} className="rounded-card panel p-4 sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-ink">
                      {p.creatorName || "Creator"}
                    </p>
                    <p className="text-sm break-words text-muted">
                      {destination(p)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-muted">
                    Asked {formatDateTime(p.createdAt)}
                  </p>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Figure label="Taken from wallet" kobo={p.amountKobo} />
                  <Figure label="Transfer cost" kobo={p.transferFeeKobo} />
                  <Figure
                    label="Amount sent"
                    kobo={p.amountKobo - p.transferFeeKobo}
                    strong
                  />
                </dl>

                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold text-ink">
                    Recent wallet activity
                  </h3>
                  {index < WITH_HISTORY ? (
                    history[index] && history[index].length > 0 ? (
                      <LedgerTable rows={history[index]} />
                    ) : (
                      <p className="text-sm text-muted">No wallet activity.</p>
                    )
                  ) : null}
                  <Link
                    href={`/admin/money/ledger?person=${p.creatorId}`}
                    className="link mt-2 inline-flex min-h-11 items-center text-sm font-semibold"
                  >
                    Everything for this creator in the ledger
                  </Link>
                </div>

                <div className="mt-4 border-t border-hairline pt-4">
                  <PayoutDecision payoutId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decided-title" className="mt-12">
        <h2 id="decided-title" className="text-display-md">
          Decided
        </h2>
        {decided.length === 0 ? (
          <p className="mt-4 text-muted">No payouts decided yet.</p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline rounded-card panel">
            {decided.map((p) => (
              <li key={p.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                  <p className="font-semibold break-words text-ink">
                    {p.creatorName || "Creator"}
                    <span className="font-normal text-muted">
                      {" "}
                      · {formatNaira(p.amountKobo - p.transferFeeKobo)} sent
                    </span>
                  </p>
                  <p className="shrink-0 font-medium text-ink">
                    {adminPayoutStatus(p.status)}
                  </p>
                </div>
                <p className="text-sm break-words text-muted">
                  {destination(p)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Asked {formatDateTime(p.createdAt)}
                  {p.approvedAt && `, decided ${formatDateTime(p.approvedAt)}`}
                  {p.approvedById && ` by admin ${p.approvedById.slice(0, 8)}`}
                  {p.paidAt && `, paid ${formatDateTime(p.paidAt)}`}
                </p>
                {p.decisionReason && (
                  <p className="mt-1 text-sm break-words text-ink">
                    “{p.decisionReason}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Figure({
  label,
  kobo,
  strong,
}: {
  label: string;
  kobo: number;
  strong?: boolean;
}) {
  return (
    <div className="rounded-card bg-surface-soft p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={
          strong
            ? "text-lg font-semibold tabular-nums text-ink"
            : "font-semibold tabular-nums text-ink"
        }
      >
        {formatNaira(kobo)}
      </dd>
    </div>
  );
}
