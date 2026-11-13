import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CampaignTable } from "@/components/campaigns/campaign-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { getApplicationCounts } from "@/lib/db/applications";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import {
  HeaderSkeleton,
  PageLoading,
  TableSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Your campaigns" };

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <PageLoading label="Loading your campaigns…">
          <HeaderSkeleton action />
          <TableSkeleton rows={5} />
        </PageLoading>
      }
    >
      <Campaigns />
    </Suspense>
  );
}

async function Campaigns() {
  const user = await requireRole("business");
  const [campaigns, counts] = await Promise.all([
    listOwnCampaigns(user.id),
    getApplicationCounts(),
  ]);
  const newCampaign = (
    <Link href="/business/campaigns/new" className={buttonVariants()}>
      <Plus aria-hidden="true" />
      New campaign
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Campaigns"
        lead="Everything you’ve drafted, sent for review or published."
        actions={campaigns.length > 0 ? newCampaign : undefined}
      />
      {campaigns.length > 0 ? (
        <CampaignTable campaigns={campaigns} counts={counts} showCount />
      ) : (
        <EmptyState
          icon={Megaphone}
          tone="sun"
          title="No campaigns yet"
          action={newCampaign}
        >
          Describe what you want creators to post and who you’re looking for.
          You’ll see how many creators qualify before it goes live.
        </EmptyState>
      )}
    </>
  );
}
