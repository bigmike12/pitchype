import { Kanban, Megaphone, PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  Board,
  BoardCard,
  BoardColumn,
  BoardTabs,
} from "@/components/ui/board";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  BoardSkeleton,
  HeaderSkeleton,
  PageLoading,
} from "@/components/ui/skeleton";
import { APPLICATION_STATUS_LABELS } from "@/lib/applications";
import { requireRole } from "@/lib/auth";
import {
  CREATOR_COLUMNS,
  creatorColumn,
  shownColumn,
  type CreatorColumn,
} from "@/lib/board";
import { lagosToday } from "@/lib/campaign";
import { formatDate, formatDateTime } from "@/lib/creator-profile";
import { listMyApplications, type MyApplication } from "@/lib/db/applications";
import { INFLUENCER_FEE_BPS, MIN_FEE_KOBO, creatorFee } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your work" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DOTS: Record<Exclude<CreatorColumn, "closed">, string> = {
  applied: "bg-field",
  hired: "bg-brand-coral",
  ready: "bg-brand-violet",
  in_progress: "bg-brand-green",
  to_review: "bg-brand-violet",
  changes: "bg-brand-coral",
  disputed: "bg-ink",
  paid: "bg-ink",
};

export default function WorkPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <PageLoading label="Loading your work…">
          <HeaderSkeleton action />
          <BoardSkeleton />
        </PageLoading>
      }
    >
      <WorkBoard searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkBoard({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("influencer");
  const [applications, query] = await Promise.all([
    listMyApplications(),
    searchParams,
  ]);
  const today = lagosToday();
  const findCampaigns = (
    <Link href="/campaigns" className={buttonVariants()}>
      <Megaphone aria-hidden="true" />
      Find campaigns
    </Link>
  );

  if (applications.length === 0) {
    return (
      <>
        <PageHeader
          title="Your work"
          lead="Every campaign you’ve applied to, from sent to paid."
        />
        <EmptyState
          icon={Kanban}
          tone="lilac"
          title="No applications yet"
          action={findCampaigns}
        >
          Apply to campaigns you qualify for. Each one shows here as a card that
          moves from applied to hired, in progress and paid.
        </EmptyState>
      </>
    );
  }

  const byColumn = new Map<CreatorColumn, MyApplication[]>();
  for (const application of applications) {
    const column = creatorColumn(application);
    byColumn.set(column, [...(byColumn.get(column) ?? []), application]);
  }
  const counts = new Map<string, number>(
    CREATOR_COLUMNS.map((c) => [c.key, byColumn.get(c.key)?.length ?? 0]),
  );
  const requested = Array.isArray(query.col) ? query.col[0] : query.col;
  const shown = shownColumn(CREATOR_COLUMNS, counts, requested);
  const closed = byColumn.get("closed") ?? [];
  // Creators can open a campaign only while it takes applications.
  const viewable = (a: MyApplication) =>
    a.campaign.status === "open" && a.campaign.applicationsCloseOn >= today;

  return (
    <>
      <PageHeader
        title="Your work"
        lead="Every campaign you’ve applied to, from sent to paid."
      />

      <div className="space-y-3">
        <BoardTabs
          columns={CREATOR_COLUMNS}
          counts={counts}
          shown={shown}
          hrefs={Object.fromEntries(
            CREATOR_COLUMNS.map((c) => [c.key, `/applications?col=${c.key}`]),
          )}
        />
        <Board label="Your work">
          {CREATOR_COLUMNS.map((column) => {
            const cards = byColumn.get(column.key) ?? [];
            return (
              <BoardColumn
                key={column.key}
                columnKey={column.key}
                label={column.label}
                hint={column.hint}
                count={cards.length}
                dot={DOTS[column.key]}
                shownOnPhone={column.key === shown}
              >
                {cards.map((a) => (
                  <WorkCard
                    key={a.id}
                    application={a}
                    column={column.key}
                    viewable={viewable(a)}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </Board>
      </div>

      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
            Closed ({closed.length}): not selected, withdrawn, lapsed or
            cancelled
          </summary>
          <ul className="mt-2 max-w-3xl divide-y divide-hairline rounded-card panel">
            {closed.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {viewable(a) ? (
                      <Link
                        href={`/campaigns/${a.campaign.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {a.campaign.title}
                      </Link>
                    ) : (
                      a.campaign.title
                    )}
                  </p>
                  <p className="text-muted">
                    {a.campaign.businessName} · applied{" "}
                    {formatDate(a.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-surface-card px-2.5 py-1 text-xs font-semibold text-muted">
                  {closedLabel(a)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function closedLabel(a: MyApplication): string {
  if (a.status === "approved" && a.engagement?.status === "cancelled") {
    return a.engagement.cancelReason === "payment_expired"
      ? "Lapsed"
      : "Cancelled";
  }
  if (a.status === "approved" && a.engagement?.status === "refunded") {
    return "Refunded";
  }
  return APPLICATION_STATUS_LABELS[a.status];
}

function WorkCard({
  application: a,
  column,
  viewable,
}: {
  application: MyApplication;
  column: Exclude<CreatorColumn, "closed">;
  viewable: boolean;
}) {
  const e = a.engagement;
  const priceKobo =
    e?.agreedPriceKobo ?? a.proposedPriceKobo ?? a.campaign.priceKobo;
  const jobHref = e ? `/jobs/${e.id}` : null;

  return (
    // Only a paid job can be dragged: dropping it on "In progress" opens the
    // job, where starting work is confirmed.
    <BoardCard draggable={column === "ready"}>
      <div className="pr-5">
        <h3 className="font-semibold text-ink">
          {column === "applied" && viewable ? (
            <Link
              href={`/campaigns/${a.campaign.id}`}
              className="underline-offset-4 hover:underline"
            >
              {a.campaign.title}
            </Link>
          ) : (
            a.campaign.title
          )}
        </h3>
        <p className="truncate text-xs text-muted">{a.campaign.businessName}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="font-semibold text-ink tabular-nums">
          {formatNaira(column === "paid" && e ? netKobo(e) : priceKobo)}
        </span>
        {column === "applied" && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold text-ink",
              a.status === "shortlisted" ? "bg-brand-lilac" : "bg-surface-card",
            )}
          >
            {APPLICATION_STATUS_LABELS[a.status]}
          </span>
        )}
        {column !== "applied" && column !== "hired" && column !== "paid" && (
          <span className="rounded-full bg-brand-mint px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink">
            Held by Pitchype
          </span>
        )}
      </div>

      <p className="text-xs text-muted">{detail(a, column)}</p>
      {column === "applied" && a.briefEditedAt && (
        <p className="flex items-center gap-1.5 text-xs text-ink">
          <PencilLine className="size-3.5" aria-hidden="true" />
          Brief edited {formatDate(a.briefEditedAt)}
        </p>
      )}

      {jobHref && column === "ready" && (
        <Link
          href={jobHref}
          data-drop-action="in_progress"
          className={buttonVariants({ size: "sm", className: "w-full" })}
        >
          Start work
          <span className="sr-only">: {a.campaign.title}</span>
        </Link>
      )}
      {jobHref && column !== "ready" && (
        <Link
          href={jobHref}
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "w-full",
          })}
        >
          Open job
          <span className="sr-only">: {a.campaign.title}</span>
        </Link>
      )}
    </BoardCard>
  );
}

/** What reached the wallet: the amount released, less our fee on it. */
function netKobo(e: NonNullable<MyApplication["engagement"]>): number {
  const released = e.releasedKobo ?? e.agreedPriceKobo;
  return (
    released -
    creatorFee(
      released,
      e.creatorFeeBps ?? INFLUENCER_FEE_BPS,
      e.creatorMinFeeKobo ?? MIN_FEE_KOBO,
    )
  );
}

function detail(
  a: MyApplication,
  column: Exclude<CreatorColumn, "closed">,
): string {
  const e = a.engagement;
  switch (column) {
    case "applied":
      return `Applied ${formatDate(a.createdAt)}`;
    case "hired":
      return e
        ? `${a.campaign.businessName} has until ${formatDateTime(e.payBy)} to pay`
        : "Waiting for payment";
    case "ready":
      return e?.fundedAt
        ? `Paid ${formatDate(e.fundedAt)}. Start when you’re ready.`
        : "Paid. Start when you’re ready.";
    case "in_progress":
      return e?.startedAt
        ? `Started ${formatDate(e.startedAt)}`
        : "Work in progress";
    case "to_review":
      return "Sent in. Waiting for the business to review.";
    case "changes":
      return "Sent back. Fix the work and send it again.";
    case "disputed":
      return "Pitchype is reviewing this.";
    case "paid":
      return e?.releasedKobo
        ? `${formatNaira(e.releasedKobo)} earned, less our fee`
        : "Added to your wallet";
  }
}
