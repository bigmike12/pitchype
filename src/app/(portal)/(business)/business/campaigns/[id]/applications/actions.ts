"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { approveApplication, decideApplication } from "@/lib/db/applications";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

// Each action checks the session and role; the database checks that the
// application is on one of this business's campaigns, its standing, blocks,
// places and the price (create_applications migration).

export type DecisionState = FormState<"note">;

export async function shortlistAction(form: FormData): Promise<void> {
  await requireRole("business");
  const result = await decideApplication(
    text(form, "applicationId"),
    "shortlisted",
    null,
  );
  if (result.ok) sendEmailsAfterResponse();
  refresh();
}

export async function rejectAction(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await requireRole("business");
  const note = text(form, "note").trim();
  if (note.length > 500) {
    return {
      status: "error",
      errors: { note: "Keep it to 500 characters or fewer." },
      values: { note },
    };
  }
  const result = await decideApplication(
    text(form, "applicationId"),
    "rejected",
    note || null,
  );
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  refresh();
  return { status: "success", message: "Done." };
}

export type ApproveState = FormState<never>;

/**
 * Approves at the price (and, per click, the rate) the business saw. If the
 * creator changed it in the meantime, the database refuses and the page shows
 * the new one.
 */
export async function approveAction(
  _previous: ApproveState,
  form: FormData,
): Promise<ApproveState> {
  await requireRole("business");
  const expected = Number(text(form, "expectedPriceKobo"));
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    return { status: "error", message: refusalText("price_changed") };
  }
  // A per-click hire is approved at the rate shown too.
  const rawRate = text(form, "expectedCpcKobo");
  const expectedRate = rawRate === "" ? null : Number(rawRate);
  if (
    expectedRate !== null &&
    (!Number.isSafeInteger(expectedRate) || expectedRate <= 0)
  ) {
    return { status: "error", message: refusalText("rate_changed") };
  }
  const result = await approveApplication(
    text(form, "applicationId"),
    expected,
    expectedRate,
  );
  if (!result.ok) {
    refresh();
    return { status: "error", message: refusalText(result.reason) };
  }
  // Before redirect(), which throws.
  sendEmailsAfterResponse();
  redirect(`/business/engagements/${result.value}/pay`);
}
