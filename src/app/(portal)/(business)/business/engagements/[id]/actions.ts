"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { cancelFundedEngagement } from "@/lib/db/money";
import { text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CancelFundedState = FormState<never>;

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
  refresh();
  return { status: "success", message: "The hire is cancelled." };
}
