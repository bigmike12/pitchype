import {
  BadgeCheck,
  CircleSlash,
  Clock,
  PencilLine,
  Send,
  Star,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { hireEndedUnpaid } from "@/lib/applications";
import type { PaymentModel } from "@/lib/campaign";
import { formatDate } from "@/lib/creator-profile";
import type { MyApplication } from "@/lib/db/applications";
import { formatNaira } from "@/lib/money";

import { withdrawAction } from "./actions";
import { ApplyForm } from "./apply-form";

type Tone = "info" | "attention" | "success" | "danger";

/** Where the creator's application stands, and what they can still do. */
export function ApplicationPanel({
  application,
  paymentModel,
}: {
  application: MyApplication;
  paymentModel: PaymentModel;
}) {
  const { status, engagement, campaign } = application;
  const perClick = paymentModel === "per_click";
  const rateKobo = application.proposedCpcKobo ?? campaign.cpcKobo;
  const price =
    perClick && rateKobo !== null
      ? `${formatNaira(rateKobo)} a click`
      : formatNaira(application.proposedPriceKobo ?? campaign.priceKobo);
  // What a hire was agreed at: the price per click and the cap on a
  // per-click hire, the price on a fixed one.
  const agreed = (hire: { agreedPriceKobo: number; cpcKobo: number | null }) =>
    hire.cpcKobo === null
      ? formatNaira(hire.agreedPriceKobo)
      : `${formatNaira(hire.cpcKobo)} a click, up to ${formatNaira(hire.agreedPriceKobo)}`;
  const open = status === "submitted" || status === "shortlisted";
  const applyAgain = hireEndedUnpaid(application);

  let view: { tone: Tone; icon: LucideIcon; title: string; text: string };
  if (status === "approved" && engagement?.status === "awaiting_payment") {
    view = {
      tone: "success",
      icon: BadgeCheck,
      title: "You’re hired",
      text: `Agreed at ${agreed(engagement)}. The business is paying into escrow; don’t start work until we show it’s paid.`,
    };
  } else if (status === "approved" && engagement?.status === "cancelled") {
    view = {
      tone: "info",
      icon: Clock,
      title:
        engagement.cancelReason === "payment_expired"
          ? "This hire lapsed"
          : "The business cancelled this hire",
      text:
        engagement.cancelReason === "payment_expired"
          ? "The business didn’t pay within 48 hours, so the place was freed. Nothing was charged and no work is due."
          : "They cancelled before paying, so nothing was charged and no work is due.",
    };
  } else if (status === "approved") {
    view = {
      tone: "success",
      icon: BadgeCheck,
      title: "You’re hired",
      text: `Agreed at ${engagement ? agreed(engagement) : price}.`,
    };
  } else if (status === "shortlisted") {
    view = {
      tone: "success",
      icon: Star,
      title: "You’re shortlisted",
      text: `The business is considering you at ${price}.`,
    };
  } else if (status === "rejected") {
    view = {
      tone: "info",
      icon: CircleSlash,
      title: "Not selected this time",
      text: application.decisionNote
        ? `The business said: “${application.decisionNote}”`
        : "The business chose other creators for this campaign.",
    };
  } else if (status === "withdrawn") {
    view = {
      tone: "info",
      icon: CircleSlash,
      title: "You withdrew",
      text: "You can’t apply to this campaign again.",
    };
  } else {
    view = {
      tone: "info",
      icon: Send,
      title: "Application sent",
      text: `You applied on ${formatDate(application.createdAt)} at ${price}. The business will shortlist, hire or pass.`,
    };
  }

  return (
    <section aria-label="Your application" className="space-y-3">
      <Callout tone={view.tone} icon={view.icon} title={view.title}>
        {view.text}
      </Callout>

      {application.briefEditedAt && (
        <Callout tone="attention" icon={PencilLine} title="The brief changed">
          The business edited it on {formatDate(application.briefEditedAt)},
          after you applied. Read it again below.
        </Callout>
      )}

      {applyAgain && (
        <div className="rounded-card panel p-5 sm:p-6">
          <h2 className="text-display-md">Apply again</h2>
          <p className="mt-2 mb-5">
            The place is open again. Apply and the business can hire you again,
            at the price you choose.
          </p>
          <ApplyForm
            campaignId={campaign.id}
            campaignPriceKobo={campaign.priceKobo}
            campaignCpcKobo={campaign.cpcKobo}
            paymentModel={paymentModel}
          />
        </div>
      )}

      {open && (
        <div className="rounded-card panel p-5 sm:p-6">
          <details>
            <summary className="cursor-pointer font-semibold text-ink">
              Change your {perClick ? "rate" : "price"} or note
            </summary>
            <div className="mt-5">
              <ApplyForm
                campaignId={campaign.id}
                campaignPriceKobo={campaign.priceKobo}
                campaignCpcKobo={campaign.cpcKobo}
                paymentModel={paymentModel}
                application={application}
              />
            </div>
          </details>
          <details className="mt-5 border-t border-hairline pt-5">
            <summary className="cursor-pointer font-semibold text-ink">
              Withdraw your application
            </summary>
            <p className="mt-3">
              The business won’t see it any more, and you can’t apply to this
              campaign again.
            </p>
            <form action={withdrawAction} className="mt-4">
              <input
                type="hidden"
                name="applicationId"
                value={application.id}
              />
              <Button type="submit" variant="secondary">
                Withdraw
              </Button>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}
