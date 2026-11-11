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
import { formatDate } from "@/lib/creator-profile";
import type { MyApplication } from "@/lib/db/applications";
import { formatNaira } from "@/lib/money";

import { withdrawAction } from "./actions";
import { ApplyForm } from "./apply-form";

type Tone = "info" | "attention" | "success" | "danger";

/** Where the creator's application stands, and what they can still do. */
export function ApplicationPanel({
  application,
}: {
  application: MyApplication;
}) {
  const { status, engagement, campaign } = application;
  const price = formatNaira(
    application.proposedPriceKobo ?? campaign.priceKobo,
  );
  const open = status === "submitted" || status === "shortlisted";

  let view: { tone: Tone; icon: LucideIcon; title: string; text: string };
  if (status === "approved" && engagement?.status === "awaiting_payment") {
    view = {
      tone: "success",
      icon: BadgeCheck,
      title: "You’re hired",
      text: `Agreed at ${formatNaira(engagement.agreedPriceKobo)}. The business is paying into escrow; don’t start work until we show it’s paid.`,
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
          ? "The business didn’t pay within 48 hours, so the place was freed."
          : "They cancelled before paying, so nothing was charged and no work is due.",
    };
  } else if (status === "approved") {
    view = {
      tone: "success",
      icon: BadgeCheck,
      title: "You’re hired",
      text: `Agreed at ${engagement ? formatNaira(engagement.agreedPriceKobo) : price}.`,
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
    <section aria-label="Your application" className="mt-6 space-y-3">
      <Callout tone={view.tone} icon={view.icon} title={view.title}>
        {view.text}
      </Callout>

      {application.briefEditedAt && (
        <Callout tone="attention" icon={PencilLine} title="The brief changed">
          The business edited it on {formatDate(application.briefEditedAt)},
          after you applied. Read it again below.
        </Callout>
      )}

      {open && (
        <div className="rounded-card panel p-5 sm:p-6">
          <details>
            <summary className="cursor-pointer font-semibold text-ink">
              Change your price or note
            </summary>
            <div className="mt-5">
              <ApplyForm
                campaignId={campaign.id}
                campaignPriceKobo={campaign.priceKobo}
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
