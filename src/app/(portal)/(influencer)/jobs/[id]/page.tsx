import { CircleCheck, CircleSlash, Clock, Hammer } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getEngagementDetails } from "@/lib/db/applications";
import { formatRate, INFLUENCER_FEE_BPS, MIN_FEE_KOBO } from "@/lib/fees";
import { describeJobStatus } from "@/lib/job-status-words";
import { formatNaira } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

import { StartWorkForm } from "./start-form";
import { WithdrawForm } from "./withdraw-form";

export const metadata: Metadata = { title: "Your job" };

type Params = Promise<{ id: string }>;

const UNSETTLED = [
  "awaiting_payment",
  "funded",
  "in_progress",
  "submitted",
  "denied",
  "disputed",
];

export default function JobPage({ params }: { params: Params }) {
  return (
    <div className="max-w-5xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the job…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={3} />
            <div className="mt-4">
              <PanelSkeleton lines={4} />
            </div>
          </PageLoading>
        }
      >
        <Job params={params} />
      </Suspense>
    </div>
  );
}

async function Job({ params }: { params: Params }) {
  const user = await requireRole("influencer");
  const { id } = await params;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.creator.id !== user.id) notFound();

  const business = engagement.business.name;
  const status = describeJobStatus(
    { ...engagement, businessName: business },
    new Date(),
  );
  const rate = formatRate(engagement.creatorFeeBps ?? INFLUENCER_FEE_BPS);
  // The full-price figure only applies until the job settles; after that the
  // callout says what actually reached the wallet.
  const showEarnings = UNSETTLED.includes(engagement.status);
  const feeKobo = engagement.agreedPriceKobo - status.youReceiveKobo;
  const minFee = formatNaira(engagement.creatorMinFeeKobo ?? MIN_FEE_KOBO);

  const timeline = [
    { label: "Approved", at: engagement.approvedAt },
    { label: "Paid", at: engagement.fundedAt },
    { label: "Work started", at: engagement.startedAt },
    {
      label: engagement.status === "cancelled" ? "Cancelled" : "Settled",
      at: engagement.settledAt ?? engagement.cancelledAt,
    },
  ].flatMap((step) => (step.at ? [{ label: step.label, at: step.at }] : []));

  return (
    <>
      <PageHeader
        title={engagement.campaign.title}
        crumbs={[{ href: "/applications", label: "Your work" }]}
        lead={`A job for ${business}.`}
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="xl:col-start-1">
          <Callout
            tone={
              engagement.status === "awaiting_payment"
                ? "attention"
                : engagement.status === "cancelled" ||
                    engagement.status === "refunded"
                  ? "info"
                  : "success"
            }
            icon={
              engagement.status === "awaiting_payment"
                ? Clock
                : engagement.status === "in_progress"
                  ? Hammer
                  : engagement.status === "cancelled" ||
                      engagement.status === "refunded"
                    ? CircleSlash
                    : CircleCheck
            }
            title={status.title}
          >
            {status.body}
          </Callout>
        </div>
        <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {showEarnings && (
            <>
              <dl className="space-y-3 rounded-card p-4 text-sm panel sm:p-5">
                <div className="flex justify-between gap-4">
                  <dt>Agreed price</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatNaira(engagement.agreedPriceKobo)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-hairline pt-3">
                  <dt className="font-semibold text-ink">You’ll receive</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatNaira(status.youReceiveKobo)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-muted">
                That’s after our {formatNaira(feeKobo)} fee ({rate}, at least{" "}
                {minFee}), which comes off when the payment is released to your
                wallet.
              </p>
            </>
          )}
        </div>
        <div className="xl:col-start-1">
          <SectionCard id="timeline" title="What’s happened">
            <ol className="divide-y divide-hairline">
              {timeline.map((step) => (
                <li
                  key={step.label}
                  className="flex justify-between gap-4 px-4 py-3 text-sm sm:px-5"
                >
                  <span className="font-semibold text-ink">{step.label}</span>
                  <time dateTime={step.at} className="text-muted">
                    {formatDateTime(step.at)}
                  </time>
                </li>
              ))}
            </ol>
          </SectionCard>

          {status.canStart && <StartWorkForm engagementId={engagement.id} />}
          {status.canWithdraw && (
            <WithdrawForm
              engagementId={engagement.id}
              businessName={business}
            />
          )}
          {engagement.status === "in_progress" && (
            <p className="mt-8 border-t border-hairline pt-5">
              Work has started, so neither of you can cancel on your own. If
              something goes wrong, contact {CONTACT_EMAIL}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
