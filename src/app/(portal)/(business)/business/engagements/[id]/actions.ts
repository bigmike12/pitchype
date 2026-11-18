"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { cancelFundedEngagement } from "@/lib/db/money";
import { acceptSubmission, denySubmission } from "@/lib/db/submissions";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { text, type FormState } from "@/lib/form-data";
import { openDisputeFromForm, type DisputeState } from "@/lib/open-dispute";
import { parseDenialReasons } from "@/lib/proof";
import { refusalText } from "@/lib/refusals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CancelFundedState = FormState<never>;
export type ReviewState = FormState<"reasons">;

// The review time ran out first, so the database released the money instead.
const REVIEW_ENDED =
  "Your review time ended, so the payment was released automatically.";

/**
 * The business cancels a paid hire before work starts and gets the price
 * back in its wallet; the fee is kept (CLAUDE.md §6.2). The database checks
 * it's this business's hire, that it's still `funded`, and the fee notice;
 * the notice is checked here too so the client can't skip it.
 */
export async function cancelFundedAction(
  _previous: CancelFundedState,
  form: FormData,
): Promise<CancelFundedState> {
  await requireRole("business");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("feeNoticeSeen") !== "on") {
    return { status: "error", message: refusalText("fee_notice_required") };
  }
  const result = await cancelFundedEngagement(engagementId, true);
  if (!result.ok) {
    refresh();
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  refresh();
  return { status: "success", message: "The hire is cancelled." };
}

/**
 * The business accepts the work and the price is released to the creator.
 * The database checks it's this business's hire and that the work is waiting
 * for review; if the review time ended first it releases instead and says so.
 */
export async function acceptSubmissionAction(
  _previous: ReviewState,
  form: FormData,
): Promise<ReviewState> {
  await requireRole("business");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  const result = await acceptSubmission(engagementId);
  // Refresh on a refusal too: the hire may have changed under the business.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  return {
    status: "success",
    message:
      result.value === "auto_released"
        ? REVIEW_ENDED
        : "You accepted the work. The payment has been released.",
  };
}

/**
 * The business sends the work back with 1 to 5 reasons. The creator sees the
 * reasons and can fix the work, or open a dispute.
 */
export async function denySubmissionAction(
  _previous: ReviewState,
  form: FormData,
): Promise<ReviewState> {
  await requireRole("business");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  const reasons = parseDenialReasons(
    form.getAll("reason").filter((v): v is string => typeof v === "string"),
  );
  if (!reasons.ok) {
    return { status: "error", errors: { reasons: reasons.message } };
  }
  const result = await denySubmission(engagementId, reasons.reasons);
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  // Also for "review_closed": the database released the money instead.
  sendEmailsAfterResponse();
  if (result.value === "review_closed") {
    return { status: "error", message: REVIEW_ENDED };
  }
  return { status: "success", message: "You sent the work back." };
}

/**
 * The business opens a dispute: on work it sent back, or on work that never
 * came. The database decides which of those the hire is in.
 */
export async function openDisputeAction(
  _previous: DisputeState,
  form: FormData,
): Promise<DisputeState> {
  const user = await requireRole("business");
  const state = await openDisputeFromForm(user.id, form);
  if (state.status === "success") sendEmailsAfterResponse();
  return state;
}
