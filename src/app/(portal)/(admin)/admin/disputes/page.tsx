import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listOpenDisputes, type DisputeListRow } from "@/lib/db/disputes";
import {
  daysOpenWords,
  OPENED_FROM_WORDS,
  STATEMENT_AUTHOR_LABEL,
} from "@/lib/dispute-words";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";

export const metadata: Metadata = { title: "Disputes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin");
  const [disputes, query] = await Promise.all([
    listOpenDisputes(),
    searchParams,
  ]);
  // Computed once for the whole list, so every row counts from the same time.
  const now = new Date();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Disputes"
        lead="Open disputes, oldest first. Each hire’s money stays in escrow until an admin decides."
      />
      <QueueCard
        id="disputes-title"
        title="Open disputes"
        note="Pitchype aims to decide within 5 working days of opening. The other side is asked to respond within 3 days."
        empty="No disputes are open."
        paged={pageOf(disputes, parsePage(query.page), QUEUE_PAGE_SIZE)}
        noun={["dispute", "disputes"]}
        hrefFor={(page) => pagedHref("/admin/disputes", {}, page)}
      >
        {(dispute) => (
          <DisputeItem key={dispute.id} dispute={dispute} now={now} />
        )}
      </QueueCard>
    </div>
  );
}

function DisputeItem({ dispute, now }: { dispute: DisputeListRow; now: Date }) {
  const opener =
    dispute.openedByRole === "creator"
      ? dispute.creatorName
      : dispute.businessName;
  return (
    <li className="p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-semibold break-words text-ink">
            {dispute.campaignTitle}
          </p>
          <p className="text-sm text-muted">
            {dispute.businessName} hired {dispute.creatorName}
          </p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums text-ink">
          {formatNaira(dispute.agreedPriceKobo)}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted">
        Opened by {STATEMENT_AUTHOR_LABEL[dispute.openedByRole].toLowerCase()}{" "}
        {opener} {OPENED_FROM_WORDS[dispute.openedFrom]} ·{" "}
        {daysOpenWords(dispute.openedAt, now)}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-body">{dispute.reason}</p>
      <Link
        href={`/admin/disputes/${dispute.id}`}
        className="link mt-2 inline-flex min-h-11 items-center text-sm font-semibold"
      >
        Read and decide
      </Link>
    </li>
  );
}
