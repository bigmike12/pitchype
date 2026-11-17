// What has happened to a hire, in plain words, for the business's hire page.
// No framework imports, so node tests cover the wording.

import { formatDateTime } from "./creator-profile.ts";
import { formatNaira } from "./money.ts";

/** The facts about a hire that its status line is worded from. */
export type HireFacts = {
  status: string;
  creatorName: string;
  payBy: string;
  cancelReason: string | null;
  fundedAt: string | null;
  settleOutcome: string | null;
  releasedKobo: number | null;
  refundedKobo: number | null;
  businessFeeKobo: number | null;
  // Stage 7: where the review stands (from EngagementDetails).
  round: number | null;
  /** When the round waiting for review is released on its own. */
  reviewDeadlineAt: string | null;
  /** Resubmissions still allowed. */
  roundsLeft: number;
  openDisputeId: string | null;
  /** When the business may dispute missing work; null unless in progress. */
  disputeAllowedFrom: string | null;
};

export type HireStatusWords = {
  title: string;
  body: string;
  /** The hire has reached an end. */
  done: boolean;
  /** Unpaid and still inside its 48 hours: the Pay button belongs here. */
  canPay: boolean;
  /** Work sent in and still inside its review time: accept or send back. */
  canReview: boolean;
  /** The business can open a dispute now. */
  canOpenDispute: boolean;
};

const ended = (title: string, body: string): HireStatusWords => ({
  title,
  body,
  done: true,
  canPay: false,
  canReview: false,
  canOpenDispute: false,
});
const running = (
  title: string,
  body: string,
  actions: Partial<Pick<HireStatusWords, "canReview" | "canOpenDispute">> = {},
): HireStatusWords => ({
  title,
  body,
  done: false,
  canPay: false,
  canReview: actions.canReview ?? false,
  canOpenDispute: actions.canOpenDispute ?? false,
});

export function describeHireStatus(e: HireFacts, now: Date): HireStatusWords {
  const creator = e.creatorName;
  const refunded = formatNaira(e.refundedKobo ?? 0);
  const released = formatNaira(e.releasedKobo ?? 0);
  const fee = formatNaira(e.businessFeeKobo ?? 0);
  // The refund when the creator is at fault is price plus our fee, less what
  // the card charged us (CLAUDE.md §6.2), so it is never "the whole fee".
  const backWithFee = `${refunded} is back in your wallet, including our fee, less the card charge.`;

  switch (e.status) {
    case "awaiting_payment":
      if (Date.parse(e.payBy) <= now.getTime()) {
        return running(
          "Waiting to lapse",
          "The time to pay has passed, so this hire will lapse shortly.",
        );
      }
      return {
        title: "Waiting for your payment",
        body: `Nothing starts until you pay. Pay by ${formatDateTime(e.payBy)} (Lagos time), or the hire lapses.`,
        done: false,
        canPay: true,
        canReview: false,
        canOpenDispute: false,
      };
    case "funded":
      return running(
        "Paid",
        `Waiting for ${creator} to start. The money is held by Pitchype until the job is done.`,
      );
    case "in_progress": {
      // The date is set only for work that is overdue; see non_delivery_dispute_at.
      const canOpenDispute =
        e.disputeAllowedFrom !== null &&
        Date.parse(e.disputeAllowedFrom) <= now.getTime();
      return running(
        "Work has started",
        canOpenDispute
          ? `${creator} is working on this, but the delivery date has passed. If the work isn’t coming, you can open a dispute. The money is held by Pitchype until the job is done.`
          : `${creator} is working on this. The money is held by Pitchype until the job is done.`,
        { canOpenDispute },
      );
    }
    case "submitted": {
      const deadline = e.reviewDeadlineAt;
      if (deadline !== null && Date.parse(deadline) <= now.getTime()) {
        // "Released" only once the ledger has moved.
        return running(
          "Review time has ended",
          `Review time ended on ${formatDateTime(deadline)}. The money is being released.`,
        );
      }
      return running(
        "Waiting for your review",
        deadline === null
          ? `${creator} has sent in the work.`
          : `${creator} has sent in the work. Review it by ${formatDateTime(deadline)} (Lagos time), or the money is released to ${creator} automatically.`,
        { canReview: true },
      );
    }
    case "denied": {
      const left =
        e.roundsLeft > 0
          ? `${creator} can fix the work and send it again (${e.roundsLeft} ${e.roundsLeft === 1 ? "resubmission" : "resubmissions"} left).`
          : `${creator} has no resubmissions left. You can open a dispute.`;
      return running("Sent back", `You asked for changes. ${left}`, {
        canOpenDispute: e.openDisputeId === null,
      });
    }
    case "disputed":
      return running(
        "Pitchype is reviewing this",
        "A dispute is open. We’ll look at both sides and decide how the money is paid out.",
      );
    case "cancelled":
      if (e.fundedAt === null) {
        return ended(
          "Cancelled",
          e.cancelReason === "payment_expired"
            ? "It wasn’t paid within 48 hours, so the place went back on offer. Nothing was charged."
            : "Nothing was charged, and the place went back on offer.",
        );
      }
      return ended(
        "Cancelled",
        e.cancelReason === "cancelled_by_creator" ||
          e.settleOutcome === "refund_creator_fault"
          ? `${creator} pulled out. ${backWithFee}`
          : `You cancelled. ${refunded} is back in your wallet. Our fee of ${fee} isn’t refunded.`,
      );
    default:
      // accepted, auto_released, paid_out, refunded: money has moved.
      if (e.status === "auto_released") {
        return ended(
          "Released automatically",
          `The review time ended, so ${released} was released to ${creator}.`,
        );
      }
      switch (e.settleOutcome) {
        case "refund":
          return ended(
            "Refunded",
            `${refunded} is back in your wallet. Our fee of ${fee} isn’t refunded.`,
          );
        case "refund_creator_fault":
          return ended("Refunded", backWithFee);
        case "split":
          return ended(
            "Settled",
            `${released} was released to ${creator} and ${refunded} is back in your wallet.`,
          );
        default:
          return ended(
            "Done",
            `The job is done. ${released} was released to ${creator}.`,
          );
      }
  }
}
