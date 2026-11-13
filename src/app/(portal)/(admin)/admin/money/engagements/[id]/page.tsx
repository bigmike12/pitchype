import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

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
import { getEngagementTrail, type EngagementTrail } from "@/lib/db/money";
import { isUuid } from "@/lib/form-data";
import { formatNaira } from "@/lib/money";
import { adminPayoutStatus } from "@/lib/payout-request";
import { checkTrail } from "@/lib/trail-check";

export const metadata: Metadata = { title: "Money trail" };

export default function TrailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the money trail…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={3} />
            <div className="mt-10">
              <SectionTitleSkeleton />
              <div className="space-y-3">
                <PanelSkeleton lines={3} />
                <PanelSkeleton lines={3} />
              </div>
            </div>
          </PageLoading>
        }
      >
        <Trail params={params} />
      </Suspense>
    </div>
  );
}

const words = (value: string) => value.replaceAll("_", " ");

/** The amount as the ledger stores it: wallets, escrow and revenue are negative. */
function signed(kobo: number): string {
  return `${kobo < 0 ? "−" : "+"}${formatNaira(Math.abs(kobo))}`;
}

async function Trail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const trail = await getEngagementTrail(id);
  if (!trail) notFound();

  const { engagement: e } = trail;
  const check = checkTrail(trail);

  return (
    <>
      <PageHeader
        title="Money trail"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead={`${e.campaignTitle}: ${e.businessName} hired ${e.creatorName}.`}
      />

      {check.ok ? (
        <Callout tone="success" icon={CircleCheck} title="Adds up">
          <p>
            The ledger lines balance, and what was paid in, held and released
            matches this hire’s price and fees.
          </p>
        </Callout>
      ) : (
        <Callout
          tone="danger"
          icon={TriangleAlert}
          title="This hire’s money does not add up"
        >
          <ul className="list-disc space-y-1 pl-5">
            {check.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Callout>
      )}

      <section
        aria-labelledby="facts-title"
        className="mt-8 rounded-card panel p-4 sm:p-5"
      >
        <h2 id="facts-title" className="sr-only">
          The hire
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Status" value={words(e.status)} />
          <Fact label="Agreed price" value={formatNaira(e.agreedPriceKobo)} />
          <Fact
            label="Business fee"
            value={
              e.businessFeeKobo === null
                ? "Not set"
                : formatNaira(e.businessFeeKobo)
            }
          />
          <Fact
            label="Creator fee"
            value={
              e.creatorFeeBps === null || e.creatorMinFeeKobo === null
                ? "Not set"
                : `${e.creatorFeeBps / 100}%, at least ${formatNaira(e.creatorMinFeeKobo)}`
            }
          />
          {e.settleOutcome && (
            <Fact label="Outcome" value={words(e.settleOutcome)} />
          )}
          {e.releasedKobo !== null && (
            <Fact label="Released" value={formatNaira(e.releasedKobo)} />
          )}
          {e.refundedKobo !== null && (
            <Fact
              label="Refunded to the business"
              value={formatNaira(e.refundedKobo)}
            />
          )}
          <Fact label="Approved" value={formatDateTime(e.approvedAt)} />
          {e.fundedAt && (
            <Fact label="Paid" value={formatDateTime(e.fundedAt)} />
          )}
          {e.startedAt && (
            <Fact label="Work started" value={formatDateTime(e.startedAt)} />
          )}
          {e.settledAt && (
            <Fact label="Settled" value={formatDateTime(e.settledAt)} />
          )}
          {e.cancelledAt && (
            <Fact
              label="Cancelled"
              value={`${formatDateTime(e.cancelledAt)}${e.cancelReason ? `: ${words(e.cancelReason)}` : ""}`}
            />
          )}
        </dl>
      </section>

      <section aria-labelledby="payments-title" className="mt-10">
        <h2 id="payments-title" className="text-display-md">
          Payments
        </h2>
        {trail.payments.length === 0 ? (
          <p className="mt-4 text-muted">No payment was started.</p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline rounded-card panel">
            {trail.payments.map((p) => (
              <PaymentItem key={p.id} payment={p} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ledger-title" className="mt-10">
        <h2 id="ledger-title" className="text-display-md">
          Ledger, in order
        </h2>
        {trail.groups.length === 0 ? (
          <p className="mt-4 text-muted">Nothing has moved yet.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {trail.groups.map((g) => (
              <GroupItem key={g.groupId} group={g} />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="payouts-title" className="mt-10">
        <h2 id="payouts-title" className="text-display-md">
          The creator’s payouts
        </h2>
        <p className="mt-2 max-w-xl">
          Payouts come from the creator’s wallet, not from one hire, so this is
          all of their payouts.
        </p>
        {trail.payouts.length === 0 ? (
          <p className="mt-4 text-muted">No payouts.</p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline rounded-card panel">
            {trail.payouts.map((p) => (
              <li key={p.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                  <p className="font-semibold text-ink tabular-nums">
                    {formatNaira(p.amountKobo)}
                    <span className="font-normal text-muted">
                      {" "}
                      · transfer cost {formatNaira(p.transferFeeKobo)}
                    </span>
                  </p>
                  <p className="shrink-0 font-medium text-ink">
                    {adminPayoutStatus(p.status)}
                  </p>
                </div>
                <p className="text-sm break-words text-muted">
                  {p.bankName} ••••{p.last4}, asked{" "}
                  {formatDateTime(p.createdAt)}
                  {p.approvedByName && `, approved by ${p.approvedByName}`}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold break-words text-ink">{value}</dd>
    </div>
  );
}

function PaymentItem({
  payment: p,
}: {
  payment: EngagementTrail["payments"][number];
}) {
  return (
    <li className="p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
        <p className="font-semibold text-ink tabular-nums">
          {formatNaira(p.totalKobo)}
          <span className="font-normal text-muted">
            {" "}
            · {formatNaira(p.cardAmountKobo)} by card,{" "}
            {formatNaira(p.walletPartKobo)} from the wallet
          </span>
        </p>
        <p className="shrink-0 font-medium text-ink">{words(p.status)}</p>
      </div>
      <p className="text-sm break-all text-muted">
        {formatDateTime(p.createdAt)} · {p.reference}
        {p.paystackFeeKobo !== null &&
          ` · Paystack charge ${formatNaira(p.paystackFeeKobo)}`}
      </p>
    </li>
  );
}

function GroupItem({ group: g }: { group: EngagementTrail["groups"][number] }) {
  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
        <p className="font-semibold text-ink">{words(g.eventType)}</p>
        <p className="shrink-0 text-sm text-muted">
          {formatDateTime(g.createdAt)}
        </p>
      </div>
      <p className="text-sm break-words text-muted">
        By {g.actorName}
        {g.paystackReference && ` · ${g.paystackReference}`}
      </p>
      {g.reason && <p className="mt-1 break-words text-ink">“{g.reason}”</p>}
      <ul className="mt-3 divide-y divide-hairline rounded-card bg-surface-soft text-sm">
        {g.lines.map((l, index) => (
          <li
            key={`${l.account}-${index}`}
            className="flex items-start justify-between gap-3 px-3 py-2"
          >
            <span className="min-w-0 text-ink">
              {words(l.account)}
              {l.ownerName && (
                <span className="text-muted"> · {l.ownerName}</span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">
              {signed(l.amountKobo)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
