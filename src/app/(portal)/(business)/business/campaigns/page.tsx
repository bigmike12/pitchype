import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CampaignTable } from "@/components/campaigns/campaign-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireRole } from "@/lib/auth";
import { campaignGroup, CAMPAIGN_GROUPS } from "@/lib/campaign";
import { getApplicationCounts } from "@/lib/db/applications";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";
import {
  HeaderSkeleton,
  PageLoading,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Your campaigns" };

const PAGE_SIZE = 10;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CampaignsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <PageLoading label="Loading your campaigns…">
          <HeaderSkeleton />
          <Skeleton className="mb-3 h-10 w-72 rounded-control" />
          <TableSkeleton rows={5} />
        </PageLoading>
      }
    >
      <Campaigns searchParams={searchParams} />
    </Suspense>
  );
}

async function Campaigns({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("business");
  const [campaigns, counts, query] = await Promise.all([
    listOwnCampaigns(user.id),
    getApplicationCounts(),
    searchParams,
  ]);

  const requested = Array.isArray(query.show) ? query.show[0] : query.show;
  const group = CAMPAIGN_GROUPS.find((g) => g.key === requested)?.key ?? "all";
  const inGroup = campaigns.filter(
    (c) => group === "all" || campaignGroup(c.status) === group,
  );
  const paged = pageOf(inGroup, parsePage(query.page), PAGE_SIZE);
  const show = group === "all" ? undefined : group;

  return (
    <>
      <PageHeader
        title="Campaigns"
        lead="Everything you’ve drafted, sent for review or published."
      />
      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          tone="sun"
          title="No campaigns yet"
          action={
            <Link href="/business/campaigns/new" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              New campaign
            </Link>
          }
        >
          Describe what you want creators to post and who you’re looking for.
          You’ll see how many creators qualify before it goes live.
        </EmptyState>
      ) : (
        <>
          <FilterTabs
            label="Filter campaigns"
            current={group}
            className="mb-3"
            tabs={CAMPAIGN_GROUPS.map((g) => ({
              key: g.key,
              label: g.label,
              count:
                g.key === "all"
                  ? campaigns.length
                  : campaigns.filter((c) => campaignGroup(c.status) === g.key)
                      .length,
              href: pagedHref(
                "/business/campaigns",
                { show: g.key === "all" ? undefined : g.key },
                1,
              ),
            }))}
          />
          {paged.total === 0 ? (
            <EmptyState icon={Megaphone} tone="lilac" title="Nothing here">
              No campaigns in this group. Try another tab.
            </EmptyState>
          ) : (
            <CampaignTable
              campaigns={paged.items}
              counts={counts}
              footer={
                <Pagination
                  framed
                  {...paged}
                  noun={["campaign", "campaigns"]}
                  hrefFor={(page) =>
                    pagedHref("/business/campaigns", { show }, page)
                  }
                />
              }
            />
          )}
        </>
      )}
    </>
  );
}
