"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { approveApplication, decideApplication } from "@/lib/db/applications";
import { text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

// Each action checks the session and role; the database checks that the
// application is on one of this business's campaigns, its standing, blocks,
// places and the price (create_applications migration).

export type DecisionState = FormState<"note">;

export async function shortlistAction(form: FormData): Promise<void> {
  await requireRole("business");
  await decideApplication(text(form, "applicationId"), "shortlisted", null);
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
  refresh();
  return { status: "success", message: "Done." };
}

export type ApproveState = FormState<never>;

/**
 * Approves at the price the business saw. If the creator changed it in the
 * meantime, the database refuses and the page shows the new price.
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
  const result = await approveApplication(
    text(form, "applicationId"),
    expected,
  );
  if (!result.ok) {
    refresh();
    return { status: "error", message: refusalText(result.reason) };
  }
  redirect(`/business/engagements/${result.value}/pay`);
}
