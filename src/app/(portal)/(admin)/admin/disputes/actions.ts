"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { decideDispute } from "@/lib/db/disputes";
import {
  addStatementFromForm,
  type StatementState,
} from "@/lib/dispute-statement";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { isUuid, text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";
import { isSettleOutcome, parseNairaAmount } from "@/lib/settle-preview";

// Every action here: sign-in and the admin role first, then the inputs, then
// the database function (which checks the admin role and that the dispute is
// still open, again).

const REASON_MAX = 500;

/** An admin adds a statement, for example a question to one side. */
export async function addAdminStatementAction(
  _previous: StatementState,
  form: FormData,
): Promise<StatementState> {
  const user = await requireRole("admin");
  const state = await addStatementFromForm(user.id, form);
  if (state.status === "success") sendEmailsAfterResponse();
  return state;
}

export type DecideState = FormState<
  "outcome" | "amount" | "reason" | "confirm"
>;

/**
 * Decides an open dispute: release, refund, split or a refund for creator
 * fault, with a written reason both people will see. The money moves in the
 * same database transaction (`decide_dispute`). As for a Stage 6 settlement,
 * the amount is read only for a split; the database checks the range. The
 * success message doesn't repeat the choice: the page that follows words the
 * ending from what the database recorded.
 */
export async function decideDisputeAction(
  _previous: DecideState,
  form: FormData,
): Promise<DecideState> {
  await requireRole("admin");

  // What was typed comes back with every refusal, so nothing has to be
  // written again.
  const values = {
    outcome: text(form, "outcome"),
    amount: text(form, "amount"),
    reason: text(form, "reason"),
  };

  const disputeId = text(form, "disputeId");
  if (!isUuid(disputeId)) {
    return {
      status: "error",
      message: refusalText("no_such_dispute"),
      values,
    };
  }
  const outcome = values.outcome;
  if (!isSettleOutcome(outcome)) {
    return {
      status: "error",
      errors: { outcome: "Choose how it is decided." },
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

  const result = await decideDispute(disputeId, outcome, releaseKobo, reason);
  // Refresh on a refusal too: someone else may have closed it first.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason), values };
  }
  sendEmailsAfterResponse();
  return { status: "success", message: "Decided. Both people are told." };
}
