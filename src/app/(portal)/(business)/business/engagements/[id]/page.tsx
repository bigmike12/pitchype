import { CircleCheck, CircleSlash, Clock, Hammer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import {
  getEngagementDetails,
  type EngagementDetails,
} from "@/lib/db/applications";
import { feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

import { CancelFundedForm } from "./cancel-form";

export const metadata: Metadata = { title: "Your hire" };

type Params = Promise<{ id: string }>;

export default function EngagementPage({ params }: { params: Params }) {
  return (
    <div className="max-w-2xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the hire…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={3} />
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

type Status = { title: string; body: string; done: boolean };

/** What has happened to this hire, in plain words, for every status. */
function describeStatus(e: EngagementDetails): Status {
  const creator = e.creator.name;
  const refunded = formatNaira(e.refundedKobo ?? 0);
  const released = formatNaira(e.releasedKobo ?? 0);
  const fee = formatNaira(e.businessFeeKobo ?? 0);

  switch (e.status) {
    case "awaiting_payment":
      return {
        title: "Waiting for your payment",
        body: `Nothing starts until you pay. Pay by ${formatDateTime(e.payBy)} (Lagos time), or the hire lapses.`,
        done: false,
      };
    case "funded":
      return {
        title: "Paid",
        body: `Paid. Waiting for ${creator} to start. The money is held by Pitchype until the job is done.`,
        done: false,
      };
    case "in_progress":
      return {
        title: "Work has started",
        body: `${creator} is working on this. The money is held by Pitchype until the job is done.`,
        done: false,
      };
    case "submitted":
      return {
        title: "Waiting for your review",
        body: `${creator} has sent in the work.`,
        done: false,
      };
    case "denied":
      return {
        title: "Sent back",
        body: `${creator} can fix the work and send it again.`,
        done: false,
      };
    case "disputed":
      return {
        title: "Under review",
        body: "We’re looking at this hire. We’ll be in touch.",
        done: false,
      };
    case "cancelled":
      if (e.fundedAt === null) {
        return {
          title: "Cancelled",
          body:
            e.cancelReason === "payment_expired"
              ? "It wasn’t paid within 48 hours, so the place went back on offer. Nothing was charged."
              : "Nothing was charged, and the place went back on offer.",
          done: true,
        };
      }
      return {
        title: "Cancelled",
        body:
          e.cancelReason === "cancelled_by_creator" ||
          e.settleOutcome === "refund_creator_fault"
            ? `${creator} pulled out. ${refunded} is back in your wallet, including our fee.`
            : `You cancelled. ${refunded} is back in your wallet. Our fee of ${fee} isn’t refunded.`,
        done: true,
      };
    default: {
      // accepted, auto_released, paid_out, refunded: money has moved.
      switch (e.settleOutcome) {
        case "refund":
          return {
            title: "Refunded",
            body: `${refunded} is back in your wallet. Our fee of ${fee} isn’t refunded.`,
            done: true,
          };
        case "refund_creator_fault":
          return {
            title: "Refunded",
            body: `${refunded} is back in your wallet, including our fee.`,
            done: true,
          };
        case "split":
          return {
            title: "Settled",
            body: `${released} went to ${creator} and ${refunded} is back in your wallet.`,
            done: true,
          };
        default:
          return {
            title: "Done",
            body: `The job is done and ${creator} has been paid ${released}.`,
            done: true,
          };
      }
    }
  }
}

async function Engagement({ params }: { params: Params }) {
  const user = await requireRole("business");
  const { id } = await params;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.business.id !== user.id) notFound();

  const feeKobo =
    engagement.businessFeeKobo ??
    feeExample(engagement.agreedPriceKobo).businessFeeKobo;
  const status = describeStatus(engagement);
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
          { href: "/business/campaigns", label: "Campaigns" },
          {
            href: `/business/campaigns/${engagement.campaign.id}`,
            label: engagement.campaign.title,
          },
          { href: applicationsHref, label: "Applications" },
        ]}
        lead={`Hired for “${engagement.campaign.title}”.`}
      />

      <Callout
        tone={
          engagement.status === "awaiting_payment"
            ? "attention"
            : status.done
              ? "info"
              : "success"
        }
        icon={
          engagement.status === "awaiting_payment"
            ? Clock
            : engagement.status === "in_progress"
              ? Hammer
              : status.done && engagement.status === "cancelled"
                ? CircleSlash
                : CircleCheck
        }
        title={status.title}
        action={
          engagement.status === "awaiting_payment" ? (
            <Link
              href={`/business/engagements/${engagement.id}/pay`}
              className={buttonVariants()}
            >
              Pay now
            </Link>
          ) : undefined
        }
      >
        {status.body}
      </Callout>

      <dl className="mt-4 space-y-3 rounded-card panel p-5 sm:p-6">
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

      <h2 className="mt-8 text-display-md">What’s happened</h2>
      <ol className="mt-3 divide-y divide-hairline rounded-card panel">
        {timeline.map((step) => (
          <li
            key={step.label}
            className="flex justify-between gap-4 px-5 py-3 sm:px-6"
          >
            <span className="font-semibold text-ink">{step.label}</span>
            <time dateTime={step.at} className="text-muted">
              {formatDateTime(step.at)}
            </time>
          </li>
        ))}
      </ol>

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
    </>
  );
}
