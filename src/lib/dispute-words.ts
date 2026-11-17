// Words for the dispute pages: how a dispute ended, how long it has been open,
// and what each statement author is called. The ending is worded from the
// dispute's stored `outcome` (the hire's final settlement, so a split that
// releases the whole price reads `release`) and the amounts the hire recorded,
// never from what an admin picked in the form. No framework imports, so node
// tests cover the wording.

import { formatNaira } from "./money.ts";

export type DisputeViewer = "creator" | "business" | "admin";

/** The dispute's facts that its ending is worded from. */
export type DisputeEnd = {
  status: "open" | "withdrawn" | "decided";
  /** A settlement outcome, or accepted_by_business. */
  outcome: string | null;
  openedFrom: "denied" | "in_progress";
};

/** What the hire recorded when it settled (null until then). */
export type DisputeMoney = {
  releasedKobo: number | null;
  refundedKobo: number | null;
  /** What the settlement credited to the creator's wallet, from the ledger. */
  creatorNetKobo: number | null;
};

export const STATEMENT_AUTHOR_LABEL = {
  creator: "Creator",
  business: "Business",
  admin: "Pitchype",
} as const;

export const OPENED_FROM_WORDS: Record<DisputeEnd["openedFrom"], string> = {
  denied: "after the work was sent back",
  in_progress: "about work that hasn’t come in",
};

export const DISPUTE_EXPECTATIONS =
  "The other side is asked to respond within 3 days. Pitchype aims to decide within 5 working days.";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since it was opened, never negative. */
export function daysOpen(openedAt: string, now: Date): number {
  const days = Math.floor((now.getTime() - Date.parse(openedAt)) / DAY_MS);
  return Math.max(0, days);
}

export function daysOpenWords(openedAt: string, now: Date): string {
  const days = daysOpen(openedAt, now);
  if (days === 0) return "Opened today";
  return days === 1 ? "Open 1 day" : `Open ${days} days`;
}

/**
 * How a closed dispute ended, for the person looking at it; null while it is
 * still open. A creator is told what reached their wallet (after our fee), a
 * business or an admin the amounts that left escrow.
 */
export function describeDisputeEnd(
  dispute: DisputeEnd,
  money: DisputeMoney,
  viewer: DisputeViewer,
  names: { creator: string; business: string; opener: string },
): { title: string; body: string } | null {
  if (dispute.status === "open") return null;
  if (dispute.status === "withdrawn") {
    return {
      title: "Dispute withdrawn",
      body: `${names.opener} withdrew it. The job went back to where it was, ${
        dispute.openedFrom === "denied"
          ? "with the work sent back"
          : "in progress"
      }. No money moved.`,
    };
  }

  const released = money.releasedKobo;
  const refunded = money.refundedKobo;
  const fromEscrow = (kobo: number | null) =>
    kobo === null ? null : formatNaira(kobo);

  // What the creator's side of the settlement reads as.
  const toCreator = (): string => {
    if (released === null) return "The payment was released.";
    if (viewer === "creator") {
      // The wallet credit is read from the ledger, never worked out here.
      return money.creatorNetKobo === null
        ? "The payment was released to your wallet, less our fee."
        : `${formatNaira(money.creatorNetKobo)} was added to your wallet after our fee.`;
    }
    return `${fromEscrow(released)} was released to ${names.creator}.`;
  };
  const toBusiness = (): string => {
    if (refunded === null) return "The payment went back to the business.";
    if (viewer === "creator") return "The payment went back to the business.";
    return viewer === "business"
      ? `${fromEscrow(refunded)} is back in your wallet.`
      : `${fromEscrow(refunded)} went back to ${names.business}.`;
  };

  switch (dispute.outcome) {
    case "accepted_by_business":
      return {
        title: "The business accepted the work",
        body: `The dispute is closed. ${toCreator()}`,
      };
    case "release":
      return {
        title: "Decided for the creator",
        body: `An admin decided this dispute. ${toCreator()}`,
      };
    case "refund":
    case "refund_creator_fault":
      return {
        title: "Decided for the business",
        body: `An admin decided this dispute. ${toBusiness()}`,
      };
    case "split":
      return {
        title: "Decided as a split",
        body: `An admin decided this dispute. ${toCreator()} ${toBusiness()}`,
      };
    default:
      return {
        title: "Dispute decided",
        body: "An admin decided this dispute.",
      };
  }
}
