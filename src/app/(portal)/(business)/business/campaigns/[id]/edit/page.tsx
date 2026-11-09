import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { lagosToday } from "@/lib/campaign";
import { getOwnCampaign } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";

import { CampaignForm } from "../../campaign-form";
import { LiveEditForm } from "./live-edit-form";

export const metadata: Metadata = { title: "Edit campaign" };

type Params = Promise<{ id: string }>;

export default function EditCampaignPage({ params }: { params: Params }) {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<LoadingNotice>Loading the campaign…</LoadingNotice>}>
        <EditCampaign params={params} />
      </Suspense>
    </div>
  );
}

async function EditCampaign({ params }: { params: Params }) {
  const user = await requireRole("business");
  const { id } = await params;
  const campaign = await getOwnCampaign(user.id, id);
  if (!campaign) notFound();
  if (!["draft", "open", "paused"].includes(campaign.status)) {
    redirect(`/business/campaigns/${campaign.id}`);
  }

  return (
    <>
      <PageHeader
        title={
          campaign.status === "draft" ? "Edit draft" : "Edit live campaign"
        }
        crumbs={[
          { href: "/business/campaigns", label: "Campaigns" },
          { href: `/business/campaigns/${campaign.id}`, label: campaign.title },
        ]}
        lead={
          campaign.status === "draft"
            ? undefined
            : "Price, requirements and what creators post are locked now that it’s live, so nobody applies to one thing and gets another."
        }
      />
      {campaign.status === "draft" ? (
        <div>
          <CampaignForm
            niches={await listNiches()}
            today={lagosToday()}
            campaign={campaign}
          />
        </div>
      ) : (
        <LiveEditForm campaign={campaign} />
      )}
    </>
  );
}
