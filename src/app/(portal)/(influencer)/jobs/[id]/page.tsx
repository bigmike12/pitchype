import {
  CircleCheck,
  CircleSlash,
  Clock,
  Hammer,
  Hourglass,
  Scale,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DisputeForm } from "@/components/engagement/dispute-form";
import { Rounds } from "@/components/engagement/rounds";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getEngagementDetails } from "@/lib/db/applications";
import { getLatestDisputeId } from "@/lib/db/disputes";
import { listSubmissions } from "@/lib/db/submissions";
import { formatRate, INFLUENCER_FEE_BPS, MIN_FEE_KOBO } from "@/lib/fees";
import { describeJobStatus } from "@/lib/job-status-words";
import { formatNaira } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

import { openDisputeAction } from "./actions";
import { StartWorkForm } from "./start-form";
import { SubmitForm } from "./submit-form";
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

// The callout's look by job status; anything else (paid out, accepted,
// released) reads as a success.
const CALLOUTS: Record<
  string,
  { tone: "info" | "attention" | "success"; icon: LucideIcon }
> = {
  awaiting_payment: { tone: "attention", icon: Clock },
  in_progress: { tone: "success", icon: Hammer },
  submitted: { tone: "info", icon: Hourglass },
  denied: { tone: "attention", icon: Undo2 },
  disputed: { tone: "info", icon: Scale },
  cancelled: { tone: "info", icon: CircleSlash },
  refunded: { tone: "info", icon: CircleSlash },
};

export default function JobPage({ params }: { params: Params }) {
  return (
    <div className="max-w-5xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the job…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={2} />
            <div className="mt-4">
              <FormSkeleton fields={3} />
            </div>
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
  // Newest round first: while resubmitting, the latest reasons come first.
  const rounds = (await listSubmissions(engagement.id)).reverse();
  // Kept after the dispute ends, so either person can read how it went.
  const disputeId = await getLatestDisputeId(engagement.id);

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

  const callout = CALLOUTS[engagement.status] ?? {
    tone: "success",
    icon: CircleCheck,
  };

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
          <Callout tone={callout.tone} icon={callout.icon} title={status.title}>
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
        <div className="space-y-4 xl:col-start-1">
          {rounds.length > 0 && (
            <SectionCard id="rounds-title" title="Your submissions">
              <Rounds rounds={rounds} />
            </SectionCard>
          )}
          {(status.canSubmit || status.canResubmit) && (
            <SubmitForm
              engagementId={engagement.id}
              deliverables={engagement.campaign.deliverables}
              deliverBy={engagement.campaign.deliverBy}
              resubmit={status.canResubmit}
              roundsLeft={engagement.roundsLeft}
            />
          )}
          {disputeId && (
            <Link
              href={`/jobs/${engagement.id}/dispute`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {engagement.openDisputeId
                ? "See the dispute"
                : "See the closed dispute"}
            </Link>
          )}

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
          {status.canOpenDispute && (
            <DisputeForm
              engagementId={engagement.id}
              action={openDisputeAction}
              intro="If you think the business was wrong to send your work back, tell us why. An admin will read both sides and decide how the money is paid out. While a dispute is open you can’t send the work in again."
            />
          )}
          {status.canWithdraw && (
            <WithdrawForm
              engagementId={engagement.id}
              businessName={business}
              afterStart={engagement.status !== "funded"}
            />
          )}
          {engagement.status === "in_progress" && (
            <p className="mt-8 border-t border-hairline pt-5">
              Work has started, so the business can’t cancel on its own. If
              something goes wrong, contact {CONTACT_EMAIL}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
