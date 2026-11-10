import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { lagosToday } from "@/lib/campaign";
import { listNiches } from "@/lib/db/creators";

import { CampaignForm } from "../campaign-form";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton crumbs />
            <FormSkeleton fields={5} />
          </PageLoading>
        }
      >
        <NewCampaign />
      </Suspense>
    </div>
  );
}

async function NewCampaign() {
  await requireRole("business");
  const niches = await listNiches();
  return (
    <>
      <PageHeader
        title="New campaign"
        crumbs={[{ href: "/business/campaigns", label: "Campaigns" }]}
      />
      <CampaignForm niches={niches} today={lagosToday()} />
    </>
  );
}
