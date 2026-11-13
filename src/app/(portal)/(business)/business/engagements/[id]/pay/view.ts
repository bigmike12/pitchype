// What the pay page shows, decided from the hire the server holds. A plain
// function so node tests cover it.

export type PayView =
  | "paid" // the hire was paid at some point: the hire page tells its story
  | "waiting" // unpaid and inside its 48 hours: show the amounts and Pay
  | "cancelled" // the business cancelled before paying
  | "lapsed"; // not paid within 48 hours

type Hire = {
  status: string;
  fundedAt: string | null;
  payBy: string;
  cancelReason: string | null;
};

export function payView(hire: Hire, now: Date): PayView {
  // Funded, started, settled, refunded or cancelled after payment: this page
  // would otherwise say "nothing was charged" to someone who paid.
  if (hire.fundedAt !== null) return "paid";
  if (
    hire.status === "awaiting_payment" &&
    Date.parse(hire.payBy) > now.getTime()
  ) {
    return "waiting";
  }
  if (hire.cancelReason === "cancelled_by_business") return "cancelled";
  // payment_expired, or past pay_by before the daily lapse job has run.
  return "lapsed";
}
