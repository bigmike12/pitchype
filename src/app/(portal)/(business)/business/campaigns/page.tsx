import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { CampaignTable } from "@/components/campaigns/campaign-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listOwnCampaigns } from "@/lib/db/campaigns";

export const metadata: Metadata = { title: "Your campaigns" };

export default function CampaignsPage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading your campaigns…</LoadingNotice>}>
      <Campaigns />
    </Suspense>
  );
}

async function Campaigns() {
  const user = await requireRole("business");
  const campaigns = await listOwnCampaigns(user.id);
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
        <CampaignTable campaigns={campaigns} />
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
