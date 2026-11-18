import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { lagosToday } from "@/lib/campaign";
import { isTrustedBusiness } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";

import { CampaignForm } from "../campaign-form";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    // Wide enough for the campaign builder's summary column.
    <div className="max-w-6xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton crumbs />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <FormSkeleton fields={3} />
              <PanelSkeleton lines={5} />
            </div>
          </PageLoading>
        }
      >
        <NewCampaign />
      </Suspense>
    </div>
  );
}

async function NewCampaign() {
  const user = await requireRole("business");
  const [niches, trusted] = await Promise.all([
    listNiches(),
    isTrustedBusiness(user.id),
  ]);
  return (
    <>
      <PageHeader
        title="New campaign"
        crumbs={[{ href: "/business/campaigns", label: "Campaigns" }]}
      />
      <CampaignForm niches={niches} today={lagosToday()} trusted={trusted} />
    </>
  );
}
