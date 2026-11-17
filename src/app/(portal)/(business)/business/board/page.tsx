import { Kanban, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { startConversationAction } from "@/app/(portal)/inbox/actions";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import { PlatformSummary } from "@/components/creators/platform-list";
import {
  Board,
  BoardCard,
  BoardColumn,
  BoardTabs,
} from "@/components/ui/board";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  BoardSkeleton,
  HeaderSkeleton,
  PageLoading,
} from "@/components/ui/skeleton";
import { hireEndedUnpaid } from "@/lib/applications";
import { requireRole } from "@/lib/auth";
import {
  BUSINESS_COLUMNS,
  businessColumn,
  shownColumn,
  type BusinessColumn,
} from "@/lib/board";
import { formatDate, formatDateTime } from "@/lib/creator-profile";
import {
  getApplicationCounts,
  listCampaignApplications,
  type CampaignApplication,
} from "@/lib/db/applications";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

import { shortlistAction } from "../campaigns/[id]/applications/actions";
import { ApproveButton } from "../campaigns/[id]/applications/decision-buttons";

export const metadata: Metadata = { title: "Hiring board" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// "All campaigns" reads each campaign's applicants in turn, so it stops at
// the most recently changed ones; pick a campaign to see an older one.
const MAX_CAMPAIGNS = 12;
// A long tail of finished hires would bury the board.
const SHOWN_COMPLETED = 5;

const DOTS: Record<Exclude<BusinessColumn, "closed">, string> = {
  applied: "bg-field",
  shortlisted: "bg-brand-violet",
  to_pay: "bg-brand-coral",
  in_progress: "bg-brand-green",
  completed: "bg-ink",
};

export default function BoardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <PageLoading label="Loading your hiring board…">
          <HeaderSkeleton action />
          <BoardSkeleton />
        </PageLoading>
      }
    >
      <HiringBoard searchParams={searchParams} />
    </Suspense>
  );
}

type Card = CampaignApplication & {
  campaignId: string;
  campaignTitle: string;
  campaignPriceKobo: number;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function HiringBoard({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("business");
  const [campaigns, counts, query] = await Promise.all([
    listOwnCampaigns(user.id),
    getApplicationCounts(),
    searchParams,
  ]);

  // Only campaigns someone has applied to can put a card on the board.
  const withApplications = campaigns.filter(
    (c) => (counts.get(c.id)?.total ?? 0) > 0 && c.priceKobo !== null,
  );
  const picked = withApplications.find((c) => c.id === first(query.campaign));
  const read = picked ? [picked] : withApplications.slice(0, MAX_CAMPAIGNS);
  const lists = await Promise.all(
    read.map((c) => listCampaignApplications(c.id)),
  );
  const cards: Card[] = read.flatMap((c, index) =>
    (lists[index] ?? []).map((a) => ({
      ...a,
      campaignId: c.id,
      campaignTitle: c.title,
      campaignPriceKobo: c.priceKobo ?? 0,
    })),
  );

  const byColumn = new Map<BusinessColumn, Card[]>();
  for (const card of cards) {
    const column = businessColumn(card);
    byColumn.set(column, [...(byColumn.get(column) ?? []), card]);
  }
  const columnCounts = new Map<string, number>(
    BUSINESS_COLUMNS.map((c) => [c.key, byColumn.get(c.key)?.length ?? 0]),
  );
  const shown = shownColumn(BUSINESS_COLUMNS, columnCounts, first(query.col));
  const closed = byColumn.get("closed") ?? [];

  const href = (campaign: string | undefined, col?: string) => {
    const params = new URLSearchParams();
    if (campaign) params.set("campaign", campaign);
    if (col) params.set("col", col);
    const text = params.toString();
    return text ? `/business/board?${text}` : "/business/board";
  };
  const newCampaign = (
    <Link href="/business/campaigns/new" className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Post a campaign
    </Link>
  );

  if (withApplications.length === 0) {
    return (
      <>
        <PageHeader
          title="Hiring board"
          lead="Every creator, from application to finished job."
        />
        <EmptyState
          icon={Kanban}
          tone="lilac"
          title="No applications yet"
          action={campaigns.length === 0 ? newCampaign : undefined}
        >
          {campaigns.length === 0
            ? "Post a campaign and the creators who apply show up here, one card each."
            : "Creators who apply to your campaigns show up here, one card each. You move them from applied to hired, paid and done."}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hiring board"
        lead="Every creator, from application to finished job. Use a card’s buttons, or drag it to the next column."
      />

      <nav
        aria-label="Filter by campaign"
        className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
      >
        {[{ id: undefined, title: "All campaigns" }, ...withApplications].map(
          (c) => {
            const current = (picked?.id ?? undefined) === c.id;
            return (
              <Link
                key={c.id ?? "all"}
                href={href(c.id)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 max-w-56 shrink-0 items-center rounded-full border px-3.5 text-sm lg:min-h-9",
                  current
                    ? "border-ink bg-ink font-semibold text-white"
                    : "border-hairline-strong bg-surface font-medium text-body hover:bg-surface-soft",
                )}
              >
                <span className="truncate">{c.title}</span>
              </Link>
            );
          },
        )}
      </nav>
      {!picked && withApplications.length > MAX_CAMPAIGNS && (
        <p className="mb-4 text-sm text-muted">
          Showing your {MAX_CAMPAIGNS} most recently changed campaigns. Pick a
          campaign above to see another.
        </p>
      )}

      <div className="space-y-3">
        <BoardTabs
          columns={BUSINESS_COLUMNS}
          counts={columnCounts}
          shown={shown}
          hrefs={Object.fromEntries(
            BUSINESS_COLUMNS.map((c) => [c.key, href(picked?.id, c.key)]),
          )}
        />
        <Board label="Hiring board">
          {BUSINESS_COLUMNS.map((column) => {
            const all = byColumn.get(column.key) ?? [];
            const visible =
              column.key === "completed" ? all.slice(0, SHOWN_COMPLETED) : all;
            return (
              <BoardColumn
                key={column.key}
                columnKey={column.key}
                label={column.label}
                hint={column.hint}
                count={all.length}
                dot={DOTS[column.key]}
                shownOnPhone={column.key === shown}
              >
                {visible.map((card) => (
                  <HireCard
                    key={card.id}
                    card={card}
                    column={column.key}
                    showCampaign={!picked}
                  />
                ))}
                {all.length > visible.length && (
                  <li className="px-1.5 text-xs text-muted">
                    and {all.length - visible.length} more, under each
                    campaign’s applications
                  </li>
                )}
              </BoardColumn>
            );
          })}
        </Board>
      </div>

      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
            Closed ({closed.length}): passed, withdrawn, cancelled or refunded
          </summary>
          <ul className="mt-2 max-w-3xl divide-y divide-hairline rounded-card panel">
            {closed.map((card) => (
              <li
                key={card.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5"
              >
                <span className="font-semibold text-ink">
                  {card.creator.displayName}
                </span>
                <Link
                  href={`/business/campaigns/${card.campaignId}/applications?tab=closed`}
                  className="text-muted underline-offset-4 hover:underline"
                >
                  {card.campaignTitle}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function HireCard({
  card,
  column,
  showCampaign,
}: {
  card: Card;
  column: Exclude<BusinessColumn, "closed">;
  showCampaign: boolean;
}) {
  const { creator, engagement } = card;
  const priceKobo = card.proposedPriceKobo ?? card.campaignPriceKobo;
  const decidable = column === "applied" || column === "shortlisted";
  const canHire = decidable && !creator.suspended && !creator.blocked;
  const reopened = hireEndedUnpaid(card);
  const applicantsHref = `/business/campaigns/${card.campaignId}/applications`;

  return (
    <BoardCard draggable={canHire || card.status === "submitted"}>
      <div className="flex items-center gap-2.5 pr-5">
        <CreatorPhoto
          name={creator.displayName}
          url={creator.photoUrl}
          sizes="36px"
          className="size-9 shrink-0 rounded-full"
        />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink">
            {creator.displayName}
          </h3>
          <p className="truncate text-xs text-muted">
            {showCampaign ? card.campaignTitle : `${creator.city}`}
          </p>
        </div>
      </div>

      {decidable && (
        <>
          <PlatformSummary platforms={creator.platforms} />
          <p className="text-[0.8125rem]">
            <span className="font-semibold text-ink tabular-nums">
              {card.proposedPriceKobo === null
                ? formatNaira(card.campaignPriceKobo)
                : `Asks ${formatNaira(card.proposedPriceKobo)}`}
            </span>{" "}
            <span className="text-muted">
              {card.proposedPriceKobo === null
                ? "your price"
                : `· your price ${formatNaira(card.campaignPriceKobo)}`}
            </span>
          </p>
          {reopened && (
            <p className="text-xs text-muted">
              Hired before, but it wasn’t paid for. The place is open again.
            </p>
          )}
          {(creator.suspended || creator.blocked) && (
            <p className="text-xs text-muted">
              {creator.blocked
                ? "Blocked: you can’t hire or message each other."
                : "Can’t be hired right now: this account is under review."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canHire && (
              <ApproveButton
                applicationId={card.id}
                creatorName={creator.displayName}
                priceKobo={priceKobo}
                again={reopened}
                size="sm"
                dropAction="to_pay"
              />
            )}
            {card.status === "submitted" && (
              <form action={shortlistAction}>
                <input type="hidden" name="applicationId" value={card.id} />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  data-drop-action="shortlisted"
                >
                  Shortlist
                </Button>
              </form>
            )}
            {column === "shortlisted" && !creator.blocked && (
              <form action={startConversationAction}>
                <input type="hidden" name="creatorId" value={creator.id} />
                <input type="hidden" name="applicationId" value={card.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Message
                </Button>
              </form>
            )}
          </div>
          <Link
            href={applicantsHref}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-ink underline underline-offset-4 lg:min-h-0"
          >
            Note, pass or block
            <span className="sr-only">: {creator.displayName}</span>
          </Link>
        </>
      )}

      {column === "to_pay" && engagement && (
        <>
          <p className="text-[0.8125rem]">
            <span className="font-semibold text-ink tabular-nums">
              {formatNaira(engagement.agreedPriceKobo)}
            </span>{" "}
            <span className="text-muted">plus our fee</span>
          </p>
          <p className="rounded-lg bg-attention px-2 py-1 text-xs font-semibold text-ink">
            Pay by {formatDateTime(engagement.payBy)}, or it lapses
          </p>
          <Link
            href={`/business/engagements/${engagement.id}/pay`}
            className={buttonVariants({ size: "sm", className: "w-full" })}
          >
            Pay
            <span className="sr-only"> for {creator.displayName}</span>
          </Link>
        </>
      )}

      {(column === "in_progress" || column === "completed") && engagement && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink tabular-nums">
              {formatNaira(
                column === "completed"
                  ? (engagement.releasedKobo ?? engagement.agreedPriceKobo)
                  : engagement.agreedPriceKobo,
              )}
            </span>
            {column === "in_progress" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold text-ink",
                  engagement.status === "funded"
                    ? "bg-surface-card"
                    : "bg-brand-mint",
                )}
              >
                {IN_PROGRESS_LABELS[engagement.status] ?? "Working"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            {column === "completed"
              ? engagement.settledAt
                ? `Released ${formatDate(engagement.settledAt)}`
                : "Released to the creator"
              : engagement.startedAt
                ? `Started ${formatDate(engagement.startedAt)}`
                : engagement.fundedAt
                  ? `Paid ${formatDate(engagement.fundedAt)}`
                  : null}
          </p>
          <Link
            href={`/business/engagements/${engagement.id}`}
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "w-full",
            })}
          >
            Open hire
            <span className="sr-only">: {creator.displayName}</span>
          </Link>
        </>
      )}
    </BoardCard>
  );
}

const IN_PROGRESS_LABELS: Record<string, string> = {
  funded: "Not started",
  in_progress: "Working",
  submitted: "Work sent in",
  denied: "Sent back",
  disputed: "Under review",
};
