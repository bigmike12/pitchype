import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  listCampaignsForReview,
  type CampaignForReview,
} from "@/lib/db/campaigns";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { approveCampaignAction, sendBackCampaignAction } from "../actions";
import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";

export const metadata: Metadata = { title: "Campaigns to review" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CampaignReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading campaigns…">
            <HeaderSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <CampaignReview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CampaignReview({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin");
  const [campaigns, query] = await Promise.all([
    listCampaignsForReview(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Campaigns to review"
        lead="A business’s first campaign waits here. Later campaigns from an approved business go live without review."
      />
      <QueueCard
        id="campaign-review-title"
        title="First campaigns"
        note="Read it, then approve it or send it back with a note the business sees."
        empty="Nothing waiting."
        paged={pageOf(campaigns, parsePage(query.page), QUEUE_PAGE_SIZE)}
        noun={["campaign", "campaigns"]}
        hrefFor={(page) => pagedHref("/admin/campaigns", {}, page)}
      >
        {(c) => <CampaignReviewItem key={c.id} campaign={c} />}
      </QueueCard>
    </>
  );
}

function CampaignReviewItem({ campaign }: { campaign: CampaignForReview }) {
  return (
    <li className="p-4 sm:p-5">
      <p className="font-semibold text-ink">
        <Link href={`/campaigns/${campaign.id}`} className="link">
          {campaign.title}
        </Link>
      </p>
      <p className="text-sm text-muted">
        {campaign.businessName}, submitted{" "}
        {formatDateTime(campaign.submittedAt)}
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <form action={approveCampaignAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <Button type="submit">Approve</Button>
        </form>
        <form
          action={sendBackCampaignAction}
          className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="campaignId" value={campaign.id} />
          <TextField
            id={`send-back-${campaign.id}`}
            label="Or send back with a note"
            name="note"
            required
            minLength={2}
            maxLength={500}
            className="flex-1"
          />
          <Button type="submit" variant="secondary">
            Send back
          </Button>
        </form>
      </div>
    </li>
  );
}
