import { BadgeCheck, Kanban, Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { startConversationAction } from "@/app/(portal)/inbox/actions";
import { BoardToolbar } from "@/components/board/board-toolbar";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import {
  Board,
  BoardCard,
  BoardCardAmount,
  BoardCardHeader,
  BoardColumn,
  BoardTabs,
  type PillTone,
} from "@/components/ui/board";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { filterHref } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import {
  BoardSkeleton,
  FiltersSkeleton,
  HeaderSkeleton,
  PageLoading,
} from "@/components/ui/skeleton";
import { hireEndedUnpaid } from "@/lib/applications";
import { requireRole } from "@/lib/auth";
import {
  BUSINESS_COLUMNS,
  businessColumn,
  creatorDetailLine,
  matchesBoardFilter,
  shownColumn,
  uniquePeople,
  type BusinessColumn,
} from "@/lib/board";
import { formatDate, formatDateTime } from "@/lib/creator-profile";
import {
  getApplicationCounts,
  listCampaignApplications,
  type CampaignApplication,
} from "@/lib/db/applications";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { formatNaira } from "@/lib/money";
import { parseSearch } from "@/lib/search";

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
  to_review: "bg-brand-violet",
  changes: "bg-brand-coral",
  disputed: "bg-ink",
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
          <FiltersSkeleton />
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
  const [campaigns, counts, niches, query] = await Promise.all([
    listOwnCampaigns(user.id),
    getApplicationCounts(),
    listNiches(),
    searchParams,
  ]);
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));

  // Only campaigns someone has applied to can put a card on the board.
  const withApplications = campaigns.filter(
    (c) => (counts.get(c.id)?.total ?? 0) > 0 && c.priceKobo !== null,
  );
  const picked = withApplications.find((c) => c.id === first(query.campaign));
  const read = picked ? [picked] : withApplications.slice(0, MAX_CAMPAIGNS);
  const lists = await Promise.all(
    read.map((c) => listCampaignApplications(c.id)),
  );
  const all: Card[] = read.flatMap((c, index) =>
    (lists[index] ?? []).map((a) => ({
      ...a,
      campaignId: c.id,
      campaignTitle: c.title,
      campaignPriceKobo: c.priceKobo ?? 0,
    })),
  );

  // The search and the picked creator narrow the cards; the people row still
  // lists everyone on the chosen campaign, so it stays usable while filtered.
  const filter = { search: parseSearch(query.q), person: first(query.who) };
  const people = uniquePeople(
    all.map((card) => ({
      id: card.creator.id,
      name: card.creator.displayName,
      photoUrl: card.creator.photoUrl,
    })),
  );
  const cards = all.filter((card) =>
    matchesBoardFilter(
      {
        personId: card.creator.id,
        text: [card.creator.displayName, card.creator.city, card.campaignTitle],
      },
      filter,
    ),
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

  // This board with one column chosen, keeping every filter on.
  const href = (col?: string) =>
    filterHref("/business/board", {
      campaign: picked?.id,
      who: filter.person,
      q: filter.search,
      col,
    });
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

      <BoardToolbar
        basePath="/business/board"
        query={{
          q: filter.search,
          who: filter.person,
          campaign: picked?.id,
          col: first(query.col),
        }}
        people={people}
        personNoun="creator"
        searchPlaceholder="Creator or campaign"
        campaigns={withApplications.map((c) => ({ id: c.id, title: c.title }))}
      />
      {!picked && withApplications.length > MAX_CAMPAIGNS && (
        <p className="mb-4 text-sm text-muted">
          Showing your {MAX_CAMPAIGNS} most recently changed campaigns. Pick one
          in the filter to see another.
        </p>
      )}
      {cards.length === 0 && all.length > 0 && (
        <p className="mb-4 text-sm text-muted">
          No cards match these filters. Clear all above to see them again.
        </p>
      )}

      <div className="space-y-3">
        <BoardTabs
          columns={BUSINESS_COLUMNS}
          counts={columnCounts}
          shown={shown}
          hrefs={Object.fromEntries(
            BUSINESS_COLUMNS.map((c) => [c.key, href(c.key)]),
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
                    detail={creatorDetailLine(
                      card.creator.platforms,
                      card.creator.niches.flatMap(
                        (s) => nicheName.get(s) ?? [],
                      ),
                    )}
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

// The pill on each card: where it stands. "In progress" depends on whether
// work has started.
const STAGES: Record<
  Exclude<BusinessColumn, "closed" | "in_progress">,
  { pill: string; tone: PillTone }
> = {
  applied: { pill: "Applied", tone: "neutral" },
  shortlisted: { pill: "Shortlisted", tone: "lilac" },
  to_pay: { pill: "To pay", tone: "sun" },
  to_review: { pill: "Work sent in", tone: "lilac" },
  changes: { pill: "Sent back", tone: "coral" },
  disputed: { pill: "Under review", tone: "neutral" },
  completed: { pill: "Released", tone: "mint" },
};

/**
 * One creator on the hiring board, laid out like the landing page's card:
 * photo, name and one line about them (niche, platform, followers), then the
 * money with a pill for where it stands, then what matters in this column
 * and its buttons.
 */
function HireCard({
  card,
  column,
  showCampaign,
  detail,
}: {
  card: Card;
  column: Exclude<BusinessColumn, "closed">;
  showCampaign: boolean;
  detail: string;
}) {
  const { creator, engagement } = card;
  const decidable = column === "applied" || column === "shortlisted";
  const canHire = decidable && !creator.suspended && !creator.blocked;
  const reopened = hireEndedUnpaid(card);
  const applicantsHref = `/business/campaigns/${card.campaignId}/applications`;
  const priceKobo = card.proposedPriceKobo ?? card.campaignPriceKobo;
  const verified = creator.platforms.some((p) => p.verified);

  const stage =
    column === "in_progress"
      ? engagement?.status === "funded"
        ? { pill: "Not started", tone: "neutral" as const }
        : { pill: "Working", tone: "mint" as const }
      : STAGES[column];
  const amountKobo = !engagement
    ? priceKobo
    : column === "completed"
      ? (engagement.releasedKobo ?? engagement.agreedPriceKobo)
      : engagement.agreedPriceKobo;

  return (
    <BoardCard draggable={canHire || card.status === "submitted"}>
      <BoardCardHeader
        avatar={
          <CreatorPhoto
            name={creator.displayName}
            url={creator.photoUrl}
            sizes="36px"
            className="size-9 shrink-0 rounded-full"
          />
        }
        title={creator.displayName}
        mark={
          verified && (
            <>
              <BadgeCheck
                className="size-4 shrink-0 fill-brand-coral text-white"
                aria-hidden="true"
              />
              <span className="sr-only">verified</span>
            </>
          )
        }
        detail={detail || creator.city}
      />

      <BoardCardAmount
        amount={formatNaira(amountKobo)}
        note={column === "to_pay" ? "plus our fee" : undefined}
        pill={stage.pill}
        tone={stage.tone}
      />

      {showCampaign && (
        <p className="flex items-center gap-1 text-xs text-muted">
          <Megaphone className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{card.campaignTitle}</span>
        </p>
      )}

      {decidable && (
        <>
          <p className="text-xs text-muted">
            Applied {formatDate(card.createdAt)}
            {card.proposedPriceKobo !== null &&
              ` · asks ${formatNaira(card.proposedPriceKobo)}, your price ${formatNaira(card.campaignPriceKobo)}`}
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

      {!decidable && column !== "to_pay" && engagement && (
        <>
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
