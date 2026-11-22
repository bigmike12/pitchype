// What the payment callback page tells the business, decided from facts the
// server holds (the confirm result, the hire's state, the payment's stored
// status), never from the URL. Plain functions so node tests cover them.

import type { CardPaymentResult } from "@/lib/payments";

export type ReturnView =
  | "funded" // the hire is paid; the creator can start
  | "lapsed" // the payment arrived after the hire lapsed; money in the wallet
  | "stranded" // the payment couldn't fund the hire; money in the wallet
  | "moved_on" // the hire has since been cancelled, refunded or settled
  | "pending" // the provider hasn't finished, or couldn't be reached: refresh
  | "failed" // the payment didn't go through
  | "checking"; // needs a person (mismatch, unknown, needs review)

type Hire = { status: string; cancelReason: string | null };

const lapsed = (hire: Hire) =>
  hire.status === "cancelled" && hire.cancelReason === "payment_expired";

/** For a payment already recorded (its row is `succeeded`, or the confirm was a duplicate). */
export function viewFromHire(
  hire: Hire,
  paymentSucceeded: boolean,
): ReturnView {
  // Recorded but not applied (a mismatch): never claim the hire is paid by it.
  if (!paymentSucceeded) return "checking";
  if (hire.status === "funded" || hire.status === "in_progress")
    return "funded";
  if (lapsed(hire)) return "lapsed";
  // Succeeded but the hire still waits: it couldn't fund it (spec §11 call 3).
  if (hire.status === "awaiting_payment") return "stranded";
  return "moved_on";
}

/** For a payment this page just confirmed with the payment provider. */
export function viewFromResult(
  result: CardPaymentResult,
  hire: Hire,
  paymentSucceeded: boolean,
): ReturnView {
  switch (result) {
    case "funded":
      return "funded";
    case "stranded":
      return lapsed(hire) ? "lapsed" : "stranded";
    case "duplicate":
      return viewFromHire(hire, paymentSucceeded);
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "checking";
  }
}

/**
 * When asking the payment provider threw: an outage or rate limit is worth a
 * refresh; any other refusal needs a person, so no refresh is promised.
 */
export function viewFromProviderError(status: number): ReturnView {
  return status === 0 || status === 429 || status >= 500
    ? "pending"
    : "checking";
}

/**
 * The words for each view. Provider-neutral on purpose: people never need to
 * know whether Cray or Paystack took the payment.
 */
export function returnCopy(
  view: ReturnView,
  creatorName: string,
): { title: string; body: string } {
  switch (view) {
    case "funded":
      return {
        title: `Payment received. ${creatorName} can now start`,
        body: "The money is held safely by Pitchype until the job is done.",
      };
    case "lapsed":
      return {
        title: "Your payment arrived after this hire lapsed",
        body: "The money is in your Pitchype wallet; the hire was not started.",
      };
    case "stranded":
      return {
        title: "Your payment couldn’t be applied to this hire",
        body: "The money is in your Pitchype wallet. Check the hire to see what to do next.",
      };
    case "pending":
      return {
        title: "Your payment is still being confirmed",
        body: "This page will not change by itself; refresh in a minute.",
      };
    case "failed":
      return {
        title: "The payment didn’t go through",
        body: "Nothing was charged to the hire.",
      };
    case "moved_on":
      return {
        title: "This hire has already moved on",
        body: "See the hire for where things stand now.",
      };
    case "checking":
      return {
        title: "We’re checking this payment",
        body: "If you were charged, nothing is lost; we’ll sort it out.",
      };
  }
}
