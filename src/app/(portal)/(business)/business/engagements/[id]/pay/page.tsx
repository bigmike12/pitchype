import { CircleSlash, Clock, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getEngagementDetails } from "@/lib/db/applications";
import { feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

import { cancelHireAction } from "./actions";

export const metadata: Metadata = { title: "Pay to start" };

type Params = Promise<{ id: string }>;

export default function PayPage({ params }: { params: Params }) {
  return (
    <div className="max-w-2xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the hire…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={5} />
          </PageLoading>
        }
      >
        <Pay params={params} />
      </Suspense>
    </div>
  );
}

// Stage 5 stops here: payment into escrow arrives in Stage 6. Until then
// the page shows exactly what will be charged, and the hire lapses after
// 48 hours (CLAUDE.md §6.1, §6.2).
async function Pay({ params }: { params: Params }) {
  const user = await requireRole("business");
  const { id } = await params;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.business.id !== user.id) notFound();

  const fees = feeExample(engagement.agreedPriceKobo);
  const now = new Date();
  const waiting =
    engagement.status === "awaiting_payment" &&
    Date.parse(engagement.payBy) > now.getTime();
  const applicationsHref = `/business/campaigns/${engagement.campaign.id}/applications`;

  return (
    <>
      <PageHeader
        title={waiting ? "Pay to start the job" : "This hire has ended"}
        crumbs={[
          { href: "/business/campaigns", label: "Campaigns" },
          {
            href: `/business/campaigns/${engagement.campaign.id}`,
            label: engagement.campaign.title,
          },
          { href: applicationsHref, label: "Applications" },
        ]}
        lead={`${engagement.creator.name}, for “${engagement.campaign.title}”.`}
      />

      {waiting ? (
        <>
          <dl className="space-y-3 rounded-card panel p-5 sm:p-6">
            <div className="flex justify-between gap-4">
              <dt>Agreed price (held in escrow)</dt>
              <dd className="font-semibold text-ink">
                {formatNaira(fees.agreedPriceKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Our fee</dt>
              <dd className="font-semibold text-ink">
                {formatNaira(fees.businessFeeKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hairline pt-3 text-lg">
              <dt className="font-semibold text-ink">You pay</dt>
              <dd className="font-semibold text-ink">
                {formatNaira(fees.businessPaysKobo)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 space-y-3">
            <Callout tone="attention" icon={Clock} title="Pay within 48 hours">
              Pay by {formatDateTime(engagement.payBy)} (Lagos time), or the
              hire lapses and the place goes back on offer.
            </Callout>
            <Callout tone="info" icon={Lock} title="Our fee isn’t refundable">
              If you cancel after paying, before work starts, you get the{" "}
              {formatNaira(fees.agreedPriceKobo)} back, not the{" "}
              {formatNaira(fees.businessFeeKobo)} fee.
            </Callout>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled>
              Pay with Paystack
            </Button>
            <p className="text-sm text-muted">
              Payments open soon. Until then, hires lapse after 48 hours.
            </p>
          </div>

          <details className="mt-8 border-t border-hairline pt-5">
            <summary className="cursor-pointer font-semibold text-ink">
              Cancel this hire
            </summary>
            <p className="mt-3">
              Nothing has been paid, so nothing is charged. The creator is told,
              and the place goes back on offer.
            </p>
            <form action={cancelHireAction} className="mt-4">
              <input type="hidden" name="engagementId" value={engagement.id} />
              <Button type="submit" variant="secondary">
                Cancel hire
              </Button>
            </form>
          </details>
        </>
      ) : (
        <Callout
          tone="info"
          icon={CircleSlash}
          title={
            engagement.status === "cancelled" &&
            engagement.cancelReason === "cancelled_by_business"
              ? "You cancelled this hire"
              : "This hire lapsed"
          }
          action={
            <Link
              href={applicationsHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Back to applications
            </Link>
          }
        >
          {engagement.status === "cancelled" &&
          engagement.cancelReason === "cancelled_by_business"
            ? "Nothing was charged, and the place went back on offer."
            : "It wasn’t paid within 48 hours, so the place went back on offer. Nothing was charged."}
        </Callout>
      )}
    </>
  );
}
