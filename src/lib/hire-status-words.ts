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
};

export type HireStatusWords = {
  title: string;
  body: string;
  /** The hire has reached an end. */
  done: boolean;
  /** Unpaid and still inside its 48 hours: the Pay button belongs here. */
  canPay: boolean;
};

const ended = (title: string, body: string): HireStatusWords => ({
  title,
  body,
  done: true,
  canPay: false,
});
const running = (title: string, body: string): HireStatusWords => ({
  title,
  body,
  done: false,
  canPay: false,
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
      };
    case "funded":
      return running(
        "Paid",
        `Waiting for ${creator} to start. The money is held by Pitchype until the job is done.`,
      );
    case "in_progress":
      return running(
        "Work has started",
        `${creator} is working on this. The money is held by Pitchype until the job is done.`,
      );
    case "submitted":
      return running(
        "Waiting for your review",
        `${creator} has sent in the work.`,
      );
    case "denied":
      return running(
        "Sent back",
        `${creator} can fix the work and send it again.`,
      );
    case "disputed":
      return running(
        "Under review",
        "We’re looking at this hire. We’ll be in touch.",
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
