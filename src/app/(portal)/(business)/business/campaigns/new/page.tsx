import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireRole } from "@/lib/auth";
import { lagosToday } from "@/lib/campaign";
import { listNiches } from "@/lib/db/creators";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { CampaignForm } from "../campaign-form";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<LoadingNotice>Loading…</LoadingNotice>}>
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
      <Link href="/business/campaigns" className="link text-sm font-medium">
        Your campaigns
      </Link>
      <h1 className="mt-4 mb-10 text-display-lg">New campaign</h1>
      <CampaignForm niches={niches} today={lagosToday()} />
    </>
  );
}
