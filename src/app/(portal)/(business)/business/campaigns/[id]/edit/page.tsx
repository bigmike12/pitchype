import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
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
      <Link
        href={`/business/campaigns/${campaign.id}`}
        className="link text-sm font-medium"
      >
        Back to the campaign
      </Link>
      <h1 className="mt-4 text-display-lg">
        {campaign.status === "draft" ? "Edit draft" : "Edit live campaign"}
      </h1>
      {campaign.status === "draft" ? (
        <div className="mt-10">
          <CampaignForm
            niches={await listNiches()}
            today={lagosToday()}
            campaign={campaign}
          />
        </div>
      ) : (
        <>
          <p className="mt-2 mb-10 max-w-xl text-muted">
            Price, requirements and what creators post are locked now that it’s
            live, so nobody applies to one thing and gets another.
          </p>
          <LiveEditForm campaign={campaign} />
        </>
      )}
    </>
  );
}
