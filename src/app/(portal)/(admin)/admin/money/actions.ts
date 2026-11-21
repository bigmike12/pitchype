"use server";

import { refresh } from "next/cache";

import { AccountCryptoError, decryptAccountNumber } from "@/lib/account-crypto";
import { requireRole } from "@/lib/auth";
import { CrayError, isCrayConfigured, validateAccount } from "@/lib/cray";
import {
  getSettlementState,
  recordCashMovement,
  setPaymentProvider,
  settleEngagement,
  type CashAccount,
  type PaymentProvider,
} from "@/lib/db/money";
import {
  approvePayout,
  attachPayoutReference,
  getPayoutByReference,
  getPayoutForApproval,
  getPayoutReference,
  rejectPayout,
} from "@/lib/db/payouts";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { isUuid, text, type FormState } from "@/lib/form-data";
import { confirmTransfer, sendCrayPayout } from "@/lib/payments";
import { PaystackError, initiateTransfer } from "@/lib/paystack";
import { namesMatch, payoutCheckOutcome } from "@/lib/payout-request";
import { providerName } from "@/lib/provider-words";
import { refusalText } from "@/lib/refusals";
import {
  alreadySettledMessage,
  settlementMatchesRequest,
} from "@/lib/settle-guard";
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

  // What was typed comes back with every refusal, so nothing has to be
  // written again.
  const values = {
    outcome: text(form, "outcome"),
    amount: text(form, "amount"),
    reason: text(form, "reason"),
  };

  const engagementId = text(form, "engagementId");
  if (!isUuid(engagementId)) {
    return {
      status: "error",
      message: refusalText("no_such_engagement"),
      values,
    };
  }
  const outcome = values.outcome;
  if (!isSettleOutcome(outcome)) {
    return {
      status: "error",
      errors: { outcome: "Choose what happens." },
      values,
    };
  }
  const reason = values.reason.trim();
  if (reason === "" || reason.length > REASON_MAX) {
    return {
      status: "error",
      errors: { reason: refusalText("settle_reason_required") },
      values,
    };
  }

  // Only a split names an amount. For the other outcomes the database uses
  // the whole price (release) or nothing (refund), so none is sent.
  let releaseKobo: number | null = null;
  if (outcome === "split") {
    const amount = parseNairaAmount(values.amount);
    if (!amount.ok) {
      return { status: "error", errors: { amount: amount.error }, values };
    }
    releaseKobo = amount.kobo;
  }
  if (form.get("confirm") !== "on") {
    return {
      status: "error",
      errors: { confirm: "Tick the box to confirm you’ve checked this." },
      values,
    };
  }

  // settle_engagement does nothing, without an error, on a hire that is
  // already settled. Look first, and look again afterwards, so "Settled."
  // is only ever said for the settlement that was asked for and recorded.
  const before = await getSettlementState(engagementId);
  if (!before) {
    return {
      status: "error",
      message: refusalText("no_such_engagement"),
      values,
    };
  }
  if (before.settledAt !== null) {
    return {
      status: "error",
      message: alreadySettledMessage(before.settleOutcome),
      values,
    };
  }

  const result = await settleEngagement(
    engagementId,
    outcome,
    releaseKobo,
    reason,
  );
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason), values };
  }

  // Someone else may have settled it between the look and the call.
  const after = await getSettlementState(engagementId);
  if (
    !after ||
    after.settledAt === null ||
    !settlementMatchesRequest(after, {
      outcome,
      releaseKobo,
      agreedPriceKobo: before.agreedPriceKobo,
    })
  ) {
    return {
      status: "error",
      message: alreadySettledMessage(after?.settleOutcome ?? null),
      values,
    };
  }
  sendEmailsAfterResponse();
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
const CRAY_NOT_REACHED =
  "Approved, but we couldn’t reach Cray to send it. Nothing was sent. Press Check with Cray to try again; the daily check also tries.";
const CRAY_PRECHECK_FAILED =
  "We couldn’t check the bank account with Cray just now. Nothing changed. Try again in a few minutes.";
const CRAY_NAME_CHANGED =
  "The bank now returns a different account name than the creator was shown, so nothing was sent. Reject this payout with a reason.";

/**
 * Approves a payout, then asks its provider to send it. The database moves the
 * payout to "processing" first and fixes the transfer reference, so asking
 * again can never send twice; if the provider doesn't take the request the
 * payout stays "processing" for the webhook and the daily check to finish.
 * A Cray payout is checked first (a fresh account check, and the name must
 * still match) BEFORE it is approved, so a changed account leaves it waiting
 * to be rejected. The provider's own words, recipient codes and account
 * numbers are never shown or logged.
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

  // Sending money is not undone by a stray click: the box is required here,
  // not only in the form.
  if (form.get("confirm") !== "on") {
    return {
      status: "error",
      message:
        "Tick the box to confirm you’ve checked the bank details and the amount.",
    };
  }

  const before = await getPayoutForApproval(payoutId);
  if (!before) {
    return { status: "error", message: refusalText("no_such_payout") };
  }
  if (before.provider === "cray") {
    if (before.bankCode === null || before.accountNumberEncrypted === null) {
      return { status: "error", message: refusalText("no_bank_account") };
    }
    try {
      const checked = await validateAccount(
        decryptAccountNumber(before.accountNumberEncrypted),
        before.bankCode,
      );
      if (!namesMatch(checked.accountName, before.accountName)) {
        return { status: "error", message: CRAY_NAME_CHANGED };
      }
    } catch (error) {
      if (!(
        error instanceof CrayError || error instanceof AccountCryptoError
      )) {
        throw error;
      }
      return { status: "error", message: CRAY_PRECHECK_FAILED };
    }
  }

  const approved = await approvePayout(payoutId);
  if (!approved.ok) {
    return { status: "error", message: refusalText(approved.reason) };
  }

  if (approved.value.provider === "cray") {
    let sent;
    try {
      sent = await sendCrayPayout(approved.value);
    } catch (error) {
      if (!(
        error instanceof CrayError || error instanceof AccountCryptoError
      )) {
        throw error;
      }
      // No refresh: the message has to stay on screen for the admin to read.
      return { status: "error", approved: true, message: CRAY_NOT_REACHED };
    }
    const outcome = payoutCheckOutcome(sent, "cray");
    refresh();
    return {
      status: outcome.status,
      approved: true,
      message:
        sent === "sent" ? "Approved and sent." : `Approved. ${outcome.message}`,
    };
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
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { reason: text(form, "reason") },
    };
  }
  sendEmailsAfterResponse();
  refresh();
  return {
    status: "success",
    message: "Rejected. The money is back in the creator’s wallet.",
  };
}

export type CheckPayoutState = FormState<never>;

const PROVIDER_UNREACHABLE = (provider: PaymentProvider) =>
  `We couldn’t reach ${providerName(provider)} just now. Nothing changed. Try again in a few minutes.`;

/**
 * Asks the payout's provider about a payout that is still processing, the
 * same check the daily job and the webhook run (confirmTransfer, idempotent in
 * the database), and says what happened in fixed words. A payout the provider
 * calls paid is marked paid; one it calls failed puts the money back in the
 * creator's wallet. For a Cray payout that was never sent, this sends it.
 */
export async function checkPayoutAction(
  _previous: CheckPayoutState,
  form: FormData,
): Promise<CheckPayoutState> {
  await requireRole("admin");
  const payoutId = text(form, "payoutId");
  if (!isUuid(payoutId)) {
    return { status: "error", message: refusalText("no_such_payout") };
  }
  const reference = await getPayoutReference(payoutId);
  if (!reference) {
    return { status: "error", message: refusalText("no_such_payout") };
  }
  const payout = await getPayoutByReference(reference);
  const provider = payout?.provider ?? "paystack";

  let outcome: ReturnType<typeof payoutCheckOutcome>;
  try {
    outcome = payoutCheckOutcome(await confirmTransfer(reference), provider);
  } catch (error) {
    if (!(error instanceof PaystackError || error instanceof CrayError)) {
      throw error;
    }
    return { status: "error", message: PROVIDER_UNREACHABLE(provider) };
  }
  if (outcome.changed) {
    sendEmailsAfterResponse();
    refresh();
  }
  return { status: outcome.status, message: outcome.message };
}

// Cray's reference ------------------------------------------------------------------

export type AttachReferenceState = FormState<"reference">;

const CRAY_REFERENCE_SHAPE = /^[A-Za-z0-9]{6,64}$/;

/**
 * An admin pastes Cray's own id for a payout whose send is unclear (Cray
 * rejected our reference as a duplicate, so it may already have gone out). The
 * next check verifies it by requery, and only settles if Cray's merchant
 * reference matches ours.
 */
export async function attachPayoutReferenceAction(
  _previous: AttachReferenceState,
  form: FormData,
): Promise<AttachReferenceState> {
  await requireRole("admin");
  const payoutId = text(form, "payoutId");
  if (!isUuid(payoutId)) {
    return { status: "error", message: refusalText("no_such_payout") };
  }
  const reference = text(form, "reference").trim();
  const values = { reference };
  if (!CRAY_REFERENCE_SHAPE.test(reference)) {
    return {
      status: "error",
      errors: {
        reference: "Paste Cray’s reference: 6 to 64 letters and numbers.",
      },
      values,
    };
  }
  const result = await attachPayoutReference(payoutId, reference);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "payout_not_attachable"
          ? "This payout can’t take a reference: it is not a processing Cray payout, or it already has one."
          : refusalText("not_allowed"),
      values,
    };
  }
  refresh();
  return {
    status: "success",
    message:
      "Attached. Press Check with Cray to confirm it with Cray before anything settles.",
  };
}

// The payment provider ----------------------------------------------------------------

export type ProviderState = FormState<"reason">;

const SWITCH_MESSAGES: Record<string, string> = {
  not_admin: "Only an admin can change the provider.",
  invalid_provider: "Choose Cray or Paystack.",
  already_active: "That provider is already the active one.",
};

/**
 * Switches which provider NEW card payments, bank transfers and payouts start
 * on. Anything already started keeps its provider. Refused when the chosen
 * provider isn't set up on this server (the message names the provider, never
 * a value), and a reason is required.
 */
export async function setPaymentProviderAction(
  _previous: ProviderState,
  form: FormData,
): Promise<ProviderState> {
  await requireRole("admin");
  const chosen = text(form, "provider");
  const reason = text(form, "reason").trim();
  const values = { reason };
  if (chosen !== "cray" && chosen !== "paystack") {
    return {
      status: "error",
      message: SWITCH_MESSAGES.invalid_provider,
      values,
    };
  }
  if (reason.length < 3 || reason.length > REASON_MAX) {
    return {
      status: "error",
      errors: { reason: "Write a reason of 3 to 500 characters." },
      values,
    };
  }
  const configured =
    chosen === "cray"
      ? isCrayConfigured()
      : (process.env.PAYSTACK_SECRET_KEY ?? "") !== "";
  if (!configured) {
    return {
      status: "error",
      message: `${providerName(chosen)} isn’t set up on this server yet (its keys are missing), so it can’t be switched to.`,
      values,
    };
  }

  const result = await setPaymentProvider(chosen, reason);
  if (!result.ok) {
    return {
      status: "error",
      message: SWITCH_MESSAGES[result.reason] ?? SWITCH_MESSAGES.not_admin,
      values,
    };
  }
  refresh();
  return {
    status: "success",
    message: `New payments and payouts now go through ${providerName(chosen)}.`,
  };
}

// Cash moved between places ------------------------------------------------------------

export type CashMovementState = FormState<"amount" | "reason">;

const CASH_ACCOUNTS: CashAccount[] = ["paystack", "cray", "bank"];
const CASH_MESSAGES: Record<string, string> = {
  not_allowed: "Only an admin can record a cash movement.",
  invalid_cash_account: "Choose two different places.",
  invalid_amount: "Enter an amount of at least ₦1.",
  reason_required: "Write a reason of 3 to 500 characters.",
  cash_not_available:
    "The ledger doesn’t show that much cash in that place, so nothing was recorded.",
};

/**
 * Records money moved between Paystack, Cray and our bank (say the owner
 * topped up Cray from the bank so payouts can go out). One balanced ledger
 * group with the reason; the database refuses more than a provider account
 * holds. The confirmation box is required here, not only in the form.
 */
export async function recordCashMovementAction(
  _previous: CashMovementState,
  form: FormData,
): Promise<CashMovementState> {
  await requireRole("admin");
  const values = {
    amount: text(form, "amount"),
    reason: text(form, "reason").trim(),
  };
  const from = text(form, "from");
  const to = text(form, "to");
  if (
    !CASH_ACCOUNTS.includes(from as CashAccount) ||
    !CASH_ACCOUNTS.includes(to as CashAccount) ||
    from === to
  ) {
    return {
      status: "error",
      message: CASH_MESSAGES.invalid_cash_account,
      values,
    };
  }
  const amount = parseNairaAmount(values.amount);
  if (!amount.ok) {
    return { status: "error", errors: { amount: amount.error }, values };
  }
  if (values.reason.length < 3 || values.reason.length > REASON_MAX) {
    return {
      status: "error",
      errors: { reason: CASH_MESSAGES.reason_required },
      values,
    };
  }
  if (form.get("confirm") !== "on") {
    return {
      status: "error",
      message: "Tick the box to confirm the money really moved.",
      values,
    };
  }

  const result = await recordCashMovement({
    from: from as CashAccount,
    to: to as CashAccount,
    amountKobo: amount.kobo,
    reason: values.reason,
  });
  if (!result.ok) {
    return {
      status: "error",
      message: CASH_MESSAGES[result.reason] ?? CASH_MESSAGES.not_allowed,
      values,
    };
  }
  refresh();
  return { status: "success", message: "Recorded." };
}
