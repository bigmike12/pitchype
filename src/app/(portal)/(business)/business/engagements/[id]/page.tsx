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
import { listSubmissions } from "@/lib/db/submissions";
import { feeExample } from "@/lib/fees";
import { describeHireStatus } from "@/lib/hire-status-words";
import { formatNaira } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

import { openDisputeAction } from "./actions";
import { CancelFundedForm } from "./cancel-form";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Your hire" };

type Params = Promise<{ id: string }>;

const CALLOUT_ICONS: Record<string, LucideIcon> = {
  awaiting_payment: Clock,
  in_progress: Hammer,
  submitted: Hourglass,
  denied: Undo2,
  disputed: Scale,
  cancelled: CircleSlash,
  refunded: CircleSlash,
};

export default function EngagementPage({ params }: { params: Params }) {
  return (
    <div className="max-w-5xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the hire…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={3} />
            <div className="mt-4">
              <FormSkeleton fields={2} />
            </div>
            <div className="mt-4">
              <PanelSkeleton lines={4} />
            </div>
          </PageLoading>
        }
      >
        <Engagement params={params} />
      </Suspense>
    </div>
  );
}

async function Engagement({ params }: { params: Params }) {
  const user = await requireRole("business");
  const { id } = await params;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.business.id !== user.id) notFound();

  // Newest round first: the one being reviewed leads the history.
  const rounds = (await listSubmissions(engagement.id)).reverse();
  const toReview = rounds.find((round) => round.status === "pending_review");

  const feeKobo =
    engagement.businessFeeKobo ??
    feeExample(engagement.agreedPriceKobo).businessFeeKobo;
  const status = describeHireStatus(
    { ...engagement, creatorName: engagement.creator.name },
    new Date(),
  );
  const showReview = status.canReview && toReview !== undefined;
  const applicationsHref = `/business/campaigns/${engagement.campaign.id}/applications`;

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
        title={engagement.creator.name}
        crumbs={[
          { href: "/business/board", label: "Hiring board" },
          {
            href: `/business/campaigns/${engagement.campaign.id}`,
            label: engagement.campaign.title,
          },
          { href: applicationsHref, label: "Applications" },
        ]}
        lead={`Hired for “${engagement.campaign.title}”.`}
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="xl:col-start-1">
          <Callout
            tone={
              engagement.status === "awaiting_payment" ||
              engagement.status === "denied"
                ? "attention"
                : status.done ||
                    engagement.status === "submitted" ||
                    engagement.status === "disputed"
                  ? "info"
                  : "success"
            }
            icon={CALLOUT_ICONS[engagement.status] ?? CircleCheck}
            title={status.title}
            action={
              status.canPay ? (
                <Link
                  href={`/business/engagements/${engagement.id}/pay`}
                  className={buttonVariants()}
                >
                  Pay now
                </Link>
              ) : engagement.status === "awaiting_payment" ? (
                <Link
                  href={applicationsHref}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Back to applications
                </Link>
              ) : undefined
            }
          >
            {status.body}
          </Callout>
        </div>
        <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <dl className="space-y-3 rounded-card p-4 text-sm panel sm:p-5">
            <div className="flex justify-between gap-4">
              <dt>Agreed price</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(engagement.agreedPriceKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Our fee</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(feeKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hairline pt-3">
              <dt className="font-semibold text-ink">
                {engagement.fundedAt
                  ? "You paid"
                  : engagement.status === "awaiting_payment"
                    ? "You pay"
                    : "Total"}
              </dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(engagement.agreedPriceKobo + feeKobo)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="space-y-4 xl:col-start-1">
          {showReview && (
            <SectionCard id="review-title" title="Work to review">
              <Rounds rounds={[toReview]} />
              <div className="space-y-4 border-t border-hairline p-4 sm:p-5">
                <p className="text-sm font-semibold text-ink">
                  Review by{" "}
                  <time dateTime={toReview.reviewDeadlineAt}>
                    {formatDateTime(toReview.reviewDeadlineAt)}
                  </time>{" "}
                  (Lagos time), or it’s released automatically.
                </p>
                <ReviewForm
                  engagementId={engagement.id}
                  creatorName={engagement.creator.name}
                  priceKobo={engagement.agreedPriceKobo}
                />
              </div>
            </SectionCard>
          )}
          {/* The review panel shows the round being reviewed; whenever it
              isn't shown (including a lone round whose review time has
              ended) the history is, so the work is never hidden. */}
          {(rounds.length > 1 || (rounds.length === 1 && !showReview)) && (
            <SectionCard
              id="rounds-title"
              title={
                rounds.length > 1 ? "All rounds of work" : "The work sent in"
              }
            >
              <Rounds rounds={rounds} />
            </SectionCard>
          )}
          {engagement.openDisputeId && (
            <Link
              href={`/business/engagements/${engagement.id}/dispute`}
              className={buttonVariants({ variant: "secondary" })}
            >
              See the dispute
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

          {status.canOpenDispute && (
            <DisputeForm
              engagementId={engagement.id}
              action={openDisputeAction}
              intro={
                engagement.status === "denied"
                  ? `If you and ${engagement.creator.name} can’t agree about the work, open a dispute. An admin will read both sides and decide how the money is paid out. You and ${engagement.creator.name} can each add statements while it is open.`
                  : `The delivery date has passed and ${engagement.creator.name} hasn’t sent in the work. Open a dispute and an admin will decide how the money is paid out. You and ${engagement.creator.name} can each add statements while it is open.`
              }
            />
          )}
          {engagement.status === "funded" && (
            <CancelFundedForm
              engagementId={engagement.id}
              priceKobo={engagement.agreedPriceKobo}
              feeKobo={feeKobo}
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
