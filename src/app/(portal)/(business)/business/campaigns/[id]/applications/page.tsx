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
  listCampaignApplications,
  type CampaignApplication,
} from "@/lib/db/applications";
import { getOwnCampaign } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { applicationBucket, hireEndedUnpaid } from "@/lib/applications";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";
import { stateLabel, type NigerianState } from "@/lib/profile";

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
  const [applications, niches] = await Promise.all([
    listCampaignApplications(campaign.id),
    listNiches(),
  ]);
  if (!applications) notFound();

  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const requested = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: Tab = TABS.some((t) => t.key === requested)
    ? (requested as Tab)
    : "waiting";
  const shown = pageOf(
    applications.filter((a) => inTab(a, tab)),
    parsePage(query.page),
    PAGE_SIZE,
  );
  const base = `/business/campaigns/${campaign.id}/applications`;

  return (
    <>
      <PageHeader
        title="Applications"
        crumbs={[
          { href: "/business/board", label: "Hiring board" },
          { href: `/business/campaigns/${campaign.id}`, label: campaign.title },
        ]}
        lead={`${campaign.places} ${campaign.places === 1 ? "place" : "places"} at ${formatNaira(campaign.priceKobo)} per creator.`}
      />

      <FilterTabs
        label="Filter applications"
        current={tab}
        className="mb-3"
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: applications.filter((a) => inTab(a, t.key)).length,
          href: pagedHref(base, { tab: t.key }, 1),
        }))}
      />

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
        hrefFor={(page) => pagedHref(base, { tab }, page)}
      />
    </>
  );
}

function ApplicationCard({
  application: a,
  campaignPriceKobo,
  nicheNames,
}: {
  application: CampaignApplication;
  campaignPriceKobo: number;
  nicheNames: string[];
}) {
  const priceKobo = a.proposedPriceKobo ?? campaignPriceKobo;
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

      <p className="mt-4 font-semibold text-ink">
        {a.proposedPriceKobo === null
          ? `At your price, ${formatNaira(campaignPriceKobo)}`
          : `Asks ${formatNaira(a.proposedPriceKobo)} · your price ${formatNaira(campaignPriceKobo)}`}
      </p>
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
