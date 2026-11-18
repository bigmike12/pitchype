import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getEngagementClicks } from "@/lib/db/clicks";
import {
  countEscrowEngagements,
  ESCROW_LIST_CAP,
  listEscrowEngagements,
  type EscrowEngagement,
} from "@/lib/db/money";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { QUEUE_PAGE_SIZE, QueueCard } from "../../queue";
import { SettleForm } from "../settle-form";

export const metadata: Metadata = { title: "Escrow" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function EscrowPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton crumbs />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Escrow searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Escrow({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const [escrow, count, query] = await Promise.all([
    listEscrowEngagements(),
    countEscrowEngagements(),
    searchParams,
  ]);
  // Per-click hires release what their counted clicks are worth, so the
  // preview needs that figure (null for a fixed-price hire).
  const clicks = new Map(
    await Promise.all(
      escrow.hires.map(
        async (hire) =>
          [
            hire.id,
            (await getEngagementClicks(hire.id))?.earnedKobo ?? null,
          ] as const,
      ),
    ),
  );

  return (
    <>
      <PageHeader
        title="Escrow"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead="Hires that are paid for and not settled yet, oldest payment first."
      />
      <QueueCard
        id="escrow-title"
        title="Hires in escrow"
        note={
          <>
            Settle one only when the creator or business can’t finish it
            themselves; every settlement needs a written reason. Work that was
            sent in, sent back or disputed is settled by its review, or by the
            dispute, not here.
            {escrow.more &&
              ` Showing the oldest ${ESCROW_LIST_CAP} of ${count}; more appear as these are settled.`}
          </>
        }
        count={count}
        empty="Nothing is in escrow."
        paged={pageOf(escrow.hires, parsePage(query.page), QUEUE_PAGE_SIZE)}
        noun={["hire", "hires"]}
        hrefFor={(page) => pagedHref("/admin/money/escrow", {}, page)}
      >
        {(hire) => (
          <EscrowItem
            key={hire.id}
            hire={hire}
            clickEarnedKobo={clicks.get(hire.id) ?? null}
          />
        )}
      </QueueCard>
    </>
  );
}

const STATUS_WORDS: Record<EscrowEngagement["status"], string> = {
  funded: "Paid, work not started",
  in_progress: "Work started",
  submitted: "Work sent in, waiting for the business to review it",
  denied: "Work sent back to the creator",
  disputed: "In dispute",
};

function EscrowItem({
  hire,
  clickEarnedKobo,
}: {
  hire: EscrowEngagement;
  /** Per-click hires: what the counted clicks are worth; null otherwise. */
  clickEarnedKobo: number | null;
}) {
  // The fee snapshot is written when the hire is funded, so it is always
  // there for a hire in escrow; if it somehow isn't, nothing is settled blind.
  const settleHere = hire.status === "funded" || hire.status === "in_progress";
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
          clickEarnedKobo,
        }
      : null;
  return (
    <li className="p-4 sm:p-5">
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
        {!settleHere ? null : facts ? (
          <SettleForm engagementId={hire.id} facts={facts} />
        ) : (
          <p className="text-sm text-danger">
            This hire’s fee details are missing, so it can’t be settled here.
            Open its trail.
          </p>
        )}
        {hire.openDisputeId && (
          <Link
            href={`/admin/disputes/${hire.openDisputeId}`}
            className="link inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Open the dispute
          </Link>
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
