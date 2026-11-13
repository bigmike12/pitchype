import { CircleSlash, Clock, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
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
import { getWalletBalance } from "@/lib/db/money";
import { feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

import { CancelHireForm } from "./cancel-hire-form";
import { PayForm } from "./pay-form";
import { payView } from "./view";

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

// Shows exactly what will be charged, with the wallet applied first, and the
// hire lapses after 48 hours (CLAUDE.md §6.1, §6.2, §6.3). The wallet is
// read for the signed-in business only; the server works the amounts out
// again when the payment starts.
async function Pay({ params }: { params: Params }) {
  const user = await requireRole("business");
  const { id } = await params;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.business.id !== user.id) notFound();
  const view = payView(engagement, new Date());
  // A hire that was ever paid (Back from Paystack, a stale tab, an old
  // notification) belongs on its hire page; this page would say "nothing was
  // charged". redirect() throws, so it stays outside any try block.
  if (view === "paid") redirect(`/business/engagements/${engagement.id}`);

  const fees = feeExample(engagement.agreedPriceKobo);
  const walletKobo = await getWalletBalance(user.id, "business_wallet");
  const walletAppliedKobo = Math.min(walletKobo, fees.businessPaysKobo);
  const cardAmountKobo = fees.businessPaysKobo - walletAppliedKobo;
  const waiting = view === "waiting";
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
              <dt>Agreed price (held by Pitchype until the job is done)</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(fees.agreedPriceKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Our fee</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(fees.businessFeeKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hairline pt-3 text-lg">
              <dt className="font-semibold text-ink">
                {walletAppliedKobo > 0 ? "Total" : "You pay"}
              </dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(fees.businessPaysKobo)}
              </dd>
            </div>
            {walletAppliedKobo > 0 && (
              <>
                <div className="flex justify-between gap-4">
                  <dt>From your wallet</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    −{formatNaira(walletAppliedKobo)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 text-lg">
                  <dt className="font-semibold text-ink">
                    {cardAmountKobo === 0
                      ? "To pay by card"
                      : "You pay by card"}
                  </dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatNaira(cardAmountKobo)}
                  </dd>
                </div>
              </>
            )}
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

          <PayForm
            engagementId={engagement.id}
            cardAmountKobo={cardAmountKobo}
          />

          <CancelHireForm engagementId={engagement.id} />
        </>
      ) : (
        <Callout
          tone="info"
          icon={CircleSlash}
          title={
            view === "cancelled"
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
          {view === "cancelled"
            ? "You cancelled this hire before paying. Nothing was charged, and the place went back on offer."
            : "It wasn’t paid within 48 hours, so the place went back on offer. Nothing was charged."}
        </Callout>
      )}
    </>
  );
}
