// What has happened to a job, in plain words, for the creator's job page.
// The business-facing sibling is hire-status-words.ts. No framework imports,
// so node tests cover the wording.

import { INFLUENCER_FEE_BPS, MIN_FEE_KOBO, creatorFee } from "./fees.ts";
import { formatNaira } from "./money.ts";

/** The facts about a job that its status line is worded from. */
export type JobFacts = {
  status: string;
  cancelReason: string | null;
  fundedAt: string | null;
  startedAt: string | null;
  settledAt: string | null;
  settleOutcome: string | null;
  releasedKobo: number | null;
  refundedKobo: number | null;
  agreedPriceKobo: number;
  /** The fee snapshot taken when the business paid; null until then. */
  creatorFeeBps: number | null;
  creatorMinFeeKobo: number | null;
  businessName: string;
  payBy: string;
};

export type JobStatusWords = {
  title: string;
  body: string;
  /** Paid and not started: the Start work panel belongs here. */
  canStart: boolean;
  /** Paid and not started: the creator can still withdraw. */
  canWithdraw: boolean;
  /** What reaches the wallet if the job completes at the full agreed price. */
  youReceiveKobo: number;
};

export function describeJobStatus(e: JobFacts, now: Date): JobStatusWords {
  const business = e.businessName;
  const bps = e.creatorFeeBps ?? INFLUENCER_FEE_BPS;
  const minKobo = e.creatorMinFeeKobo ?? MIN_FEE_KOBO;
  const youReceiveKobo =
    e.agreedPriceKobo - creatorFee(e.agreedPriceKobo, bps, minKobo);

  const words = (
    title: string,
    body: string,
    actions: { canStart?: boolean; canWithdraw?: boolean } = {},
  ): JobStatusWords => ({
    title,
    body,
    canStart: actions.canStart ?? false,
    canWithdraw: actions.canWithdraw ?? false,
    youReceiveKobo,
  });

  switch (e.status) {
    case "awaiting_payment":
      if (Date.parse(e.payBy) <= now.getTime()) {
        return words(
          `Waiting for ${business} to pay`,
          "The time to pay has passed, so this job will lapse shortly.",
        );
      }
      return words(
        `Waiting for ${business} to pay`,
        "You can start once the payment is made.",
      );
    case "funded":
      return words(
        "Paid and held by Pitchype",
        `${business} has paid. You can start work.`,
        { canStart: true, canWithdraw: true },
      );
    case "in_progress":
      return words(
        "Work in progress",
        "The payment is held by Pitchype until the job is done.",
      );
    case "submitted":
      return words(
        "Waiting for review",
        `Your submission is with ${business}.`,
      );
    case "denied":
      return words("Sent back", `${business} sent it back.`);
    case "disputed":
      return words("Under review", "This job is under review.");
    case "refunded":
      return words(
        `Refunded to ${business}`,
        `This job ended and the payment went back to ${business}.`,
      );
    case "cancelled":
      switch (e.cancelReason) {
        case "payment_expired":
          return words("This job lapsed", `${business} didn’t pay in time.`);
        case "cancelled_by_creator":
          return words(
            "You withdrew from this job",
            `The payment went back to ${business}.`,
          );
        default:
          return words(
            `${business} cancelled this job`,
            e.fundedAt
              ? `The payment went back to ${business}.`
              : "Nothing was paid.",
          );
      }
    default: {
      // accepted, auto_released, paid_out: money has moved.
      if (e.releasedKobo === null) {
        return words("Payment released", "Your payment was released.");
      }
      const added = e.releasedKobo - creatorFee(e.releasedKobo, bps, minKobo);
      return words(
        "Payment released",
        `${formatNaira(added)} was added to your wallet after our fee.`,
      );
    }
  }
}
