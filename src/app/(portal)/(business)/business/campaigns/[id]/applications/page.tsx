import { CircleSlash, ClipboardList, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BlockControl } from "@/app/(portal)/account/block-control";
import { startConversationAction } from "@/app/(portal)/inbox/actions";
import { Chip } from "@/components/brand/fragments";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import { PlatformSummary } from "@/components/creators/platform-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/creator-profile";
import {
  getApplicationCounts,
  listCampaignApplications,
  type CampaignApplication,
} from "@/lib/db/applications";
import { getOwnCampaign } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { applicationBucket, hireEndedUnpaid } from "@/lib/applications";
import { maxClicks, placesStatus } from "@/lib/campaign";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";
import { stateLabel, type NigerianState } from "@/lib/profile";
import { cn } from "@/lib/utils";

import { shortlistAction } from "./actions";
import { ApproveButton, RejectForm } from "./decision-buttons";

export const metadata: Metadata = { title: "Applications" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { key: "waiting", label: "To decide" },
  { key: "hired", label: "Hired" },
  { key: "closed", label: "Passed or withdrawn" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const PAGE_SIZE = 10;

// A per-click campaign's applications can be ordered by the rate each creator
// asks, to compare them.
const SORTS = [
  { key: "applied", label: "Order applied" },
  { key: "rate", label: "Lowest rate" },
] as const;
type Sort = (typeof SORTS)[number]["key"];

// A hire that lapsed (or was cancelled before payment) is back under "To
// decide": the place is open again, so it must not read as a filled one.
const inTab = (a: CampaignApplication, tab: Tab) =>
  applicationBucket(a) === tab;

export default function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading applications…">
            <HeaderSkeleton crumbs />
            <div className="space-y-4">
              <PanelSkeleton lines={4} />
              <PanelSkeleton lines={4} />
            </div>
          </PageLoading>
        }
      >
        <Applications params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Applications({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireRole("business");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const campaign = await getOwnCampaign(user.id, id);
  if (!campaign) notFound();
  const [applications, niches, counts] = await Promise.all([
    listCampaignApplications(campaign.id),
    listNiches(),
    getApplicationCounts(),
  ]);
  if (!applications) notFound();
  const places = placesStatus(
    campaign.places,
    counts.get(campaign.id)?.taken ?? 0,
  );

  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const requested = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: Tab = TABS.some((t) => t.key === requested)
    ? (requested as Tab)
    : "waiting";
  // A per-click campaign: each creator asks a price per click, or takes yours.
  const campaignCpcKobo =
    campaign.paymentModel === "per_click" ? campaign.cpcKobo : null;
  const rateOf = (a: CampaignApplication) =>
    a.proposedCpcKobo ?? campaignCpcKobo ?? 0;
  const requestedSort = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const sort: Sort =
    campaignCpcKobo !== null && requestedSort === "rate" ? "rate" : "applied";
  const inThisTab = applications.filter((a) => inTab(a, tab));
  const shown = pageOf(
    sort === "rate"
      ? [...inThisTab].sort(
          (x, y) =>
            rateOf(x) - rateOf(y) ||
            Date.parse(x.createdAt) - Date.parse(y.createdAt),
        )
      : inThisTab,
    parsePage(query.page),
    PAGE_SIZE,
  );
  const sortParam = sort === "rate" ? "rate" : undefined;
  const base = `/business/campaigns/${campaign.id}/applications`;
  const deciding = applications.filter((a) => inTab(a, "waiting"));

  return (
    <>
      <PageHeader
        title="Applications"
        crumbs={[
          { href: "/business/board", label: "Hiring board" },
          { href: `/business/campaigns/${campaign.id}`, label: campaign.title },
        ]}
        lead={`${campaign.places} ${campaign.places === 1 ? "place" : "places"} at ${formatNaira(campaign.priceKobo)} per creator${campaignCpcKobo === null ? "" : `, ${formatNaira(campaignCpcKobo)} a click`}. ${places.filled}${places.left > 0 ? `, ${places.needed}` : ""}.`}
      />

      <FilterTabs
        label="Filter applications"
        current={tab}
        className="mb-3"
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: applications.filter((a) => inTab(a, t.key)).length,
          href: pagedHref(base, { tab: t.key, sort: sortParam }, 1),
        }))}
      />

      {campaignCpcKobo !== null && (
        <RateComparison
          campaignCpcKobo={campaignCpcKobo}
          budgetKobo={campaign.priceKobo}
          deciding={deciding}
          sort={sort}
          hrefFor={(key) =>
            pagedHref(
              base,
              { tab, sort: key === "rate" ? "rate" : undefined },
              1,
            )
          }
        />
      )}

      {shown.total === 0 ? (
        <EmptyState
          icon={ClipboardList}
          tone="lilac"
          title={
            applications.length === 0 ? "No applications yet" : "Nothing here"
          }
        >
          {applications.length === 0
            ? "Creators who qualify can apply while the campaign is live. You’ll see them here."
            : "Try another tab."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {shown.items.map((a) => (
            <ApplicationCard
              key={a.id}
              application={a}
              campaignPriceKobo={campaign.priceKobo}
              campaignCpcKobo={campaignCpcKobo}
              nicheNames={a.creator.niches.flatMap(
                (s) => nicheName.get(s) ?? [],
              )}
            />
          ))}
        </ul>
      )}
      <Pagination
        {...shown}
        noun={["application", "applications"]}
        hrefFor={(page) => pagedHref(base, { tab, sort: sortParam }, page)}
      />
    </>
  );
}

/**
 * For a per-click campaign: the rates the creators still to decide on are
 * asking, next to the business's own, and a way to order the list by them.
 */
function RateComparison({
  campaignCpcKobo,
  budgetKobo,
  deciding,
  sort,
  hrefFor,
}: {
  campaignCpcKobo: number;
  budgetKobo: number;
  deciding: CampaignApplication[];
  sort: Sort;
  hrefFor: (sort: Sort) => string;
}) {
  const rates = deciding.map((a) => a.proposedCpcKobo ?? campaignCpcKobo);
  const own = deciding.filter((a) => a.proposedCpcKobo === null).length;
  return (
    <div className="mb-3 space-y-2 rounded-card p-4 panel sm:p-5">
      <p className="text-sm text-muted">
        You set {formatNaira(campaignCpcKobo)} a click, up to{" "}
        {formatNaira(budgetKobo)} per creator (
        {maxClicks(budgetKobo, campaignCpcKobo).toLocaleString("en-NG")}{" "}
        clicks). Creators can take that or suggest their own rate, and you
        approve the rate you see.
      </p>
      {rates.length > 0 && (
        <p className="font-semibold text-ink">
          Still to decide: {rates.length}{" "}
          {rates.length === 1 ? "creator" : "creators"}, asking{" "}
          {Math.min(...rates) === Math.max(...rates)
            ? formatNaira(Math.min(...rates))
            : `${formatNaira(Math.min(...rates))} to ${formatNaira(Math.max(...rates))}`}{" "}
          a click. {own} {own === 1 ? "takes" : "take"} your rate.
        </p>
      )}
      <p className="flex items-center gap-3 text-sm text-muted">
        Sort by
        {SORTS.map((s) => (
          <Link
            key={s.key}
            href={hrefFor(s.key)}
            aria-current={s.key === sort ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center underline-offset-4 lg:min-h-8",
              s.key === sort
                ? "font-semibold text-ink underline"
                : "hover:text-ink hover:underline",
            )}
          >
            {s.label}
          </Link>
        ))}
      </p>
    </div>
  );
}

function ApplicationCard({
  application: a,
  campaignPriceKobo,
  campaignCpcKobo,
  nicheNames,
}: {
  application: CampaignApplication;
  campaignPriceKobo: number;
  campaignCpcKobo: number | null;
  nicheNames: string[];
}) {
  const priceKobo = a.proposedPriceKobo ?? campaignPriceKobo;
  // Per click: the rate this creator would be hired at.
  const rateKobo =
    campaignCpcKobo === null ? null : (a.proposedCpcKobo ?? campaignCpcKobo);
  const open = a.status === "submitted" || a.status === "shortlisted";
  // Hired before, but the hire ended without being paid for: hire again or pass.
  const reopened = hireEndedUnpaid(a);
  const decidable = open || reopened;
  const canHire = decidable && !a.creator.suspended && !a.creator.blocked;

  return (
    <li className="rounded-card p-4 panel sm:p-5">
      <div className="flex gap-4">
        <CreatorPhoto
          name={a.creator.displayName}
          url={a.creator.photoUrl}
          sizes="56px"
          className="size-14 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-semibold text-ink">
              {a.creator.slug && a.creator.listed ? (
                <Link
                  href={`/business/creators/${a.creator.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {a.creator.displayName}
                </Link>
              ) : (
                a.creator.displayName
              )}
            </h2>
            {a.status === "shortlisted" && (
              <span className="rounded-full bg-brand-lilac px-2.5 py-1 text-xs font-semibold text-ink">
                Shortlisted
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {a.creator.city}, {stateLabel(a.creator.state as NigerianState)} ·
            applied {formatDate(a.createdAt)}
          </p>
          {nicheNames.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Niches">
              {nicheNames.map((name) => (
                <li key={name}>
                  <Chip>{name}</Chip>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <PlatformSummary platforms={a.creator.platforms} />
          </div>
        </div>
      </div>

      {rateKobo !== null && campaignCpcKobo !== null ? (
        <>
          <p className="mt-4 font-semibold text-ink">
            {a.proposedCpcKobo === null
              ? `At your rate, ${formatNaira(campaignCpcKobo)} a click`
              : `Asks ${formatNaira(rateKobo)} a click · your rate ${formatNaira(campaignCpcKobo)}`}
          </p>
          <p className="text-sm text-muted">
            {maxClicks(priceKobo, rateKobo).toLocaleString("en-NG")} clicks
            would use the full {formatNaira(priceKobo)} budget.
          </p>
        </>
      ) : (
        <p className="mt-4 font-semibold text-ink">
          {a.proposedPriceKobo === null
            ? `At your price, ${formatNaira(campaignPriceKobo)}`
            : `Asks ${formatNaira(a.proposedPriceKobo)} · your price ${formatNaira(campaignPriceKobo)}`}
        </p>
      )}
      {a.note && (
        <blockquote className="mt-2 border-l-2 border-hairline pl-3 whitespace-pre-line">
          {a.note}
        </blockquote>
      )}

      {a.creator.suspended && decidable && (
        <Callout
          tone="info"
          icon={CircleSlash}
          title="Can’t be hired right now"
          className="mt-4"
        >
          This creator’s account is under review.
        </Callout>
      )}
      {a.creator.blocked && decidable && (
        <Callout
          tone="info"
          icon={CircleSlash}
          title="Blocked"
          className="mt-4"
        >
          One of you blocked the other, so you can’t hire or message each other.
        </Callout>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canHire && (
          <ApproveButton
            applicationId={a.id}
            creatorName={a.creator.displayName}
            priceKobo={priceKobo}
            cpcKobo={rateKobo}
            again={reopened}
          />
        )}
        {a.status === "submitted" && (
          <form action={shortlistAction}>
            <input type="hidden" name="applicationId" value={a.id} />
            <Button type="submit" variant="secondary">
              Shortlist
            </Button>
          </form>
        )}
        <Outcome application={a} />
        {!a.creator.blocked && (
          <form action={startConversationAction}>
            <input type="hidden" name="creatorId" value={a.creator.id} />
            <input type="hidden" name="applicationId" value={a.id} />
            <Button type="submit" variant="ghost">
              Message
            </Button>
          </form>
        )}
        {!a.creator.blocked && (
          <BlockControl
            otherId={a.creator.id}
            otherName={a.creator.displayName}
            blockedByMe={false}
          />
        )}
        {decidable && <RejectForm applicationId={a.id} />}
      </div>
    </li>
  );
}

function Outcome({ application: a }: { application: CampaignApplication }) {
  const e = a.engagement;
  if (a.status === "approved" && e?.status === "awaiting_payment") {
    return (
      <Link
        href={`/business/engagements/${e.id}/pay`}
        className={buttonVariants()}
      >
        Pay to start · {formatNaira(e.agreedPriceKobo)}
      </Link>
    );
  }
  // Paid hires (and ones finished or cancelled after paying) have their own page.
  if (
    a.status === "approved" &&
    e &&
    (e.fundedAt || e.status !== "cancelled")
  ) {
    return (
      <Link
        href={`/business/engagements/${e.id}`}
        className={buttonVariants({ variant: "secondary" })}
      >
        View hire · {formatNaira(e.agreedPriceKobo)}
      </Link>
    );
  }
  const text =
    a.status === "approved" && e?.status === "cancelled"
      ? e.cancelReason === "payment_expired"
        ? "Hire lapsed: not paid within 48 hours. The place is open again."
        : "You cancelled this hire before paying. The place is open again."
      : a.status === "approved"
        ? `Hired at ${formatNaira(e?.agreedPriceKobo ?? 0)}.`
        : a.status === "rejected"
          ? `You passed${a.decisionNote ? `: “${a.decisionNote}”` : "."}`
          : a.status === "withdrawn"
            ? "The creator withdrew."
            : null;
  return text ? <p className="text-sm text-muted">{text}</p> : null;
}
