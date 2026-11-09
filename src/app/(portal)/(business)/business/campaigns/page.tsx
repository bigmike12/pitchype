import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { StatusPill } from "@/components/campaigns/campaign-facts";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatDay } from "@/lib/campaign";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import { formatNaira } from "@/lib/money";

import { LoadingNotice } from "@/app/(portal)/loading-notice";

export const metadata: Metadata = { title: "Your campaigns" };

export default function CampaignsPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={<LoadingNotice>Loading your campaigns…</LoadingNotice>}
      >
        <Campaigns />
      </Suspense>
    </div>
  );
}

async function Campaigns() {
  const user = await requireRole("business");
  const campaigns = await listOwnCampaigns(user.id);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display-lg">Your campaigns</h1>
        <Link href="/business/campaigns/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-8 rounded-card bg-surface-card p-6">
          <p className="font-semibold text-ink">No campaigns yet.</p>
          <p className="mt-1 max-w-xl">
            Describe what you want creators to post and who you’re looking for.
            You’ll see how many creators qualify before it goes live.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-hairline rounded-card bg-white ring-1 ring-hairline">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="relative flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="min-w-0">
                <h2 className="font-semibold text-ink">
                  <Link
                    href={`/business/campaigns/${c.id}`}
                    className="after:absolute after:inset-0"
                  >
                    {c.title}
                  </Link>
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {c.priceKobo !== null &&
                    `${formatNaira(c.priceKobo)} per creator, `}
                  {c.places} {c.places === 1 ? "place" : "places"}, applications
                  close {formatDay(c.applicationsCloseOn)}
                </p>
              </div>
              <StatusPill
                status={c.status}
                takenDown={Boolean(c.removedReason)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
