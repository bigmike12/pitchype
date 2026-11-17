// What the payment callback page tells the business, decided from facts the
// server holds (the confirm result, the hire's state, the payment's stored
// status), never from the URL. Plain functions so node tests cover them.

import type { CardPaymentResult } from "@/lib/payments";

export type ReturnView =
  | "funded" // the hire is paid; the creator can start
  | "lapsed" // the payment arrived after the hire lapsed; money in the wallet
  | "stranded" // the payment couldn't fund the hire; money in the wallet
  | "moved_on" // the hire has since been cancelled, refunded or settled
  | "pending" // Paystack hasn't finished, or couldn't be reached: refresh
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

/** For a payment this page just confirmed with Paystack. */
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
 * When asking Paystack threw: an outage or rate limit is worth a refresh;
 * any other refusal needs a person, so no refresh is promised.
 */
export function viewFromPaystackError(status: number): ReturnView {
  return status === 0 || status === 429 || status >= 500
    ? "pending"
    : "checking";
}
