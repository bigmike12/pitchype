import { ClipboardList, PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { APPLICATION_STATUS_LABELS } from "@/lib/applications";
import { requireRole } from "@/lib/auth";
import { lagosToday } from "@/lib/campaign";
import { formatDate } from "@/lib/creator-profile";
import { listMyApplications, type MyApplication } from "@/lib/db/applications";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your applications" };

export default function ApplicationsPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading your applications…">
            <HeaderSkeleton />
            <TableSkeleton rows={4} />
          </PageLoading>
        }
      >
        <Applications />
      </Suspense>
    </div>
  );
}

async function Applications() {
  await requireRole("influencer");
  const applications = await listMyApplications();
  const today = lagosToday();

  return (
    <>
      <PageHeader
        title="Applications"
        lead="Campaigns you’ve applied to, and where each one stands."
      />
      {applications.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          tone="lilac"
          title="No applications yet"
          action={
            <Link href="/campaigns" className={buttonVariants()}>
              Find campaigns
            </Link>
          }
        >
          Apply to campaigns you qualify for. Each one shows here with its
          status, from sent to hired.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-hairline rounded-card panel">
          {applications.map((a) => {
            // Creators can open a campaign only while it takes applications.
            const viewable =
              a.campaign.status === "open" &&
              a.campaign.applicationsCloseOn >= today;
            return (
              <li key={a.id} className="relative p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-ink">
                      {viewable ? (
                        <Link
                          href={`/campaigns/${a.campaign.id}`}
                          className="underline-offset-4 after:absolute after:inset-0 hover:underline"
                        >
                          {a.campaign.title}
                        </Link>
                      ) : (
                        a.campaign.title
                      )}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">
                      {a.campaign.businessName} ·{" "}
                      {formatNaira(
                        a.engagement?.agreedPriceKobo ??
                          a.proposedPriceKobo ??
                          a.campaign.priceKobo,
                      )}{" "}
                      · applied {formatDate(a.createdAt)}
                    </p>
                    {a.briefEditedAt && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                        <PencilLine className="size-4" aria-hidden="true" />
                        Brief edited {formatDate(a.briefEditedAt)}
                      </p>
                    )}
                  </div>
                  <StatusPill application={a} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const PILL_TONES = {
  submitted: "bg-surface-card text-ink",
  shortlisted: "bg-brand-lilac text-ink",
  approved: "bg-brand-mint text-ink",
  rejected: "bg-surface-card text-muted",
  withdrawn: "bg-surface-card text-muted",
} as const;

function StatusPill({ application }: { application: MyApplication }) {
  const { status, engagement } = application;
  let label: string = APPLICATION_STATUS_LABELS[status];
  let tone: string = PILL_TONES[status];
  if (status === "approved" && engagement?.status === "awaiting_payment") {
    label = "Hired · waiting for payment";
  } else if (status === "approved" && engagement?.status === "cancelled") {
    label =
      engagement.cancelReason === "payment_expired" ? "Lapsed" : "Cancelled";
    tone = PILL_TONES.rejected;
  }
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}
