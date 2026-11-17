"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { cancelFundedEngagement, startEngagement } from "@/lib/db/money";
import { text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type JobActionState = FormState<never>;

/**
 * The creator starts work on a paid job. After this they can't cancel on
 * their own (CLAUDE.md §5, §6.2), so the tick box is checked here as well as
 * in the browser. The database checks it's this creator's job and `funded`.
 */
export async function startWorkAction(
  _previous: JobActionState,
  form: FormData,
): Promise<JobActionState> {
  await requireRole("influencer");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("startConfirmed") !== "on") {
    return {
      status: "error",
      message: "Tick the box to confirm you want to start.",
    };
  }
  const result = await startEngagement(engagementId);
  // Refresh on a refusal too: the job may have changed under the creator.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return { status: "success", message: "Work has started." };
}

/**
 * The creator withdraws from a paid job before starting. The business is
 * refunded in full, including its fee, less the card charge (the database
 * takes that path for a creator caller). Nothing here decides the money.
 */
export async function withdrawAction(
  _previous: JobActionState,
  form: FormData,
): Promise<JobActionState> {
  await requireRole("influencer");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("withdrawConfirmed") !== "on") {
    return {
      status: "error",
      message: "Tick the box to confirm you want to withdraw.",
    };
  }
  // The fee-notice flag only applies to business callers; a creator's call
  // takes the withdraw path whatever it is.
  const result = await cancelFundedEngagement(engagementId, true);
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return { status: "success", message: "You’ve withdrawn from this job." };
}
