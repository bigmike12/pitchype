// What has happened to a job, in plain words, for the creator's job page.
// The business-facing sibling is hire-status-words.ts. No framework imports,
// so node tests cover the wording.

import { formatDateTime } from "./creator-profile.ts";
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

export type JobStatusWords = {
  title: string;
  body: string;
  /** Paid and not started: the Start work panel belongs here. */
  canStart: boolean;
  /** In progress: the creator can send in the work. */
  canSubmit: boolean;
  /** Sent back with resubmissions left: the creator can fix and send again. */
  canResubmit: boolean;
  /** Paid, working, or sent back: the creator can still withdraw. */
  canWithdraw: boolean;
  /** Sent back and no dispute open: the creator can open one. */
  canOpenDispute: boolean;
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
    actions: Partial<
      Pick<
        JobStatusWords,
        | "canStart"
        | "canSubmit"
        | "canResubmit"
        | "canWithdraw"
        | "canOpenDispute"
      >
    > = {},
  ): JobStatusWords => ({
    title,
    body,
    canStart: actions.canStart ?? false,
    canSubmit: actions.canSubmit ?? false,
    canResubmit: actions.canResubmit ?? false,
    canWithdraw: actions.canWithdraw ?? false,
    canOpenDispute: actions.canOpenDispute ?? false,
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
        { canSubmit: true, canWithdraw: true },
      );
    case "submitted": {
      const deadline = e.reviewDeadlineAt;
      if (deadline !== null && Date.parse(deadline) <= now.getTime()) {
        // "Released" only once the ledger has moved; until then it is being
        // released.
        return words(
          "Review time has ended",
          `Review time ended on ${formatDateTime(deadline)}. The money is being released.`,
        );
      }
      return words(
        `Waiting for ${business} to review`,
        deadline === null
          ? `Your work is with ${business}.`
          : `Your work is with ${business}. If they haven’t decided by ${formatDateTime(deadline)}, the money is released to you automatically.`,
      );
    }
    case "denied": {
      const left =
        e.roundsLeft > 0
          ? `${e.roundsLeft} ${e.roundsLeft === 1 ? "resubmission" : "resubmissions"} left.`
          : "No resubmissions left. You can open a dispute or withdraw.";
      const canResubmit = e.roundsLeft > 0 && e.openDisputeId === null;
      return words(
        "Sent back",
        canResubmit
          ? `${business} asked for changes. Fix the work and send it again. ${left}`
          : `${business} asked for changes. ${left}`,
        {
          canResubmit,
          canWithdraw: true,
          canOpenDispute: e.openDisputeId === null,
        },
      );
    }
    case "disputed":
      return words(
        "Pitchype is reviewing this",
        "A dispute is open. We’ll look at both sides and decide how the money is paid out.",
      );
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
      const auto = e.status === "auto_released";
      const title = auto ? "Released automatically" : "Payment released";
      if (e.releasedKobo === null) {
        return words(
          title,
          auto
            ? `${business} didn’t review in time, so your payment was released.`
            : "Your payment was released.",
        );
      }
      const added = e.releasedKobo - creatorFee(e.releasedKobo, bps, minKobo);
      const wallet = `${formatNaira(added)} was added to your wallet after our fee.`;
      return words(
        title,
        auto ? `${business} didn’t review in time. ${wallet}` : wallet,
      );
    }
  }
}
