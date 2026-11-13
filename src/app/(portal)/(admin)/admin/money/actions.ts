"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { settleEngagement } from "@/lib/db/money";
import { approvePayout, rejectPayout } from "@/lib/db/payouts";
import { isUuid, text, type FormState } from "@/lib/form-data";
import { PaystackError, initiateTransfer } from "@/lib/paystack";
import { refusalText } from "@/lib/refusals";
import { isSettleOutcome, parseNairaAmount } from "@/lib/settle-preview";

// Every action here: sign-in and the admin role first, then the inputs, then
// the database function (which checks the admin role and the hire's or
// payout's state again). Reasons and the confirmation are required here, not
// just in the form.

const REASON_MAX = 500;

// Settling ----------------------------------------------------------------------

export type SettleState = FormState<
  "outcome" | "amount" | "reason" | "confirm"
>;

/**
 * Releases, refunds or splits one hire's escrow. The amount released is
 * decided from the outcome (the whole price for a release, nothing for a
 * refund) and only a split reads the typed amount; the database checks the
 * range and the hire's status again.
 */
export async function settleAction(
  _previous: SettleState,
  form: FormData,
): Promise<SettleState> {
  await requireRole("admin");

  const engagementId = text(form, "engagementId");
  if (!isUuid(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  const outcome = text(form, "outcome");
  if (!isSettleOutcome(outcome)) {
    return { status: "error", errors: { outcome: "Choose what happens." } };
  }
  const reason = text(form, "reason").trim();
  if (reason === "" || reason.length > REASON_MAX) {
    return {
      status: "error",
      errors: { reason: refusalText("settle_reason_required") },
      values: { reason: text(form, "reason") },
    };
  }

  // Only a split names an amount. For the other outcomes the database uses
  // the whole price (release) or nothing (refund), so none is sent.
  let releaseKobo: number | null = null;
  if (outcome === "split") {
    const amount = parseNairaAmount(text(form, "amount"));
    if (!amount.ok) {
      return {
        status: "error",
        errors: { amount: amount.error },
        values: { amount: text(form, "amount"), reason },
      };
    }
    releaseKobo = amount.kobo;
  }
  if (form.get("confirm") !== "on") {
    return {
      status: "error",
      errors: { confirm: "Tick the box to confirm you’ve checked this." },
      values: { amount: text(form, "amount"), reason },
    };
  }

  const result = await settleEngagement(
    engagementId,
    outcome,
    releaseKobo,
    reason,
  );
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  refresh();
  return { status: "success", message: "Settled." };
}

// Payouts -----------------------------------------------------------------------

export type PayoutDecisionState = FormState<"reason"> & {
  /** The payout was approved, so the buttons are gone, whatever Paystack said. */
  approved?: boolean;
};

const TRANSFER_NOT_ACCEPTED =
  "Approved, but Paystack did not accept the transfer yet. It will be checked automatically, and the money goes back to the creator’s wallet if the transfer never starts.";

/**
 * Approves a payout, then asks Paystack to send it. The database moves the
 * payout to "processing" first and fixes the transfer reference, so asking
 * again can never send twice; if Paystack doesn't take the request the payout
 * stays "processing" for the webhook and the stuck-payout check to finish.
 * Paystack's own words, the recipient code and the account number are never
 * shown or logged.
 */
export async function approvePayoutAction(
  _previous: PayoutDecisionState,
  form: FormData,
): Promise<PayoutDecisionState> {
  await requireRole("admin");
  const payoutId = text(form, "payoutId");
  if (!isUuid(payoutId)) {
    return { status: "error", message: refusalText("no_such_payout") };
  }

  const approved = await approvePayout(payoutId);
  if (!approved.ok) {
    return { status: "error", message: refusalText(approved.reason) };
  }

  try {
    await initiateTransfer({
      amountKobo: approved.value.sendKobo,
      recipientCode: approved.value.recipientCode,
      reference: approved.value.reference,
      reason: "Pitchype payout",
    });
  } catch (error) {
    if (!(error instanceof PaystackError)) throw error;
    // No refresh: the message has to stay on screen for the admin to read.
    return { status: "error", approved: true, message: TRANSFER_NOT_ACCEPTED };
  }
  refresh();
  return { status: "success", approved: true, message: "Approved and sent." };
}

export async function rejectPayoutAction(
  _previous: PayoutDecisionState,
  form: FormData,
): Promise<PayoutDecisionState> {
  await requireRole("admin");
  const payoutId = text(form, "payoutId");
  if (!isUuid(payoutId)) {
    return { status: "error", message: refusalText("no_such_payout") };
  }
  const reason = text(form, "reason").trim();
  if (reason === "" || reason.length > REASON_MAX) {
    return {
      status: "error",
      errors: { reason: refusalText("payout_reason_required") },
      values: { reason: text(form, "reason") },
    };
  }

  const result = await rejectPayout(payoutId, reason);
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  refresh();
  return {
    status: "success",
    message: "Rejected. The money is back in the creator’s wallet.",
  };
}
