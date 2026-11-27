"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  markFeedbackDuplicate,
  setFeedbackStatus,
  unmarkFeedbackDuplicate,
} from "@/lib/db/feedback";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import {
  parseDuplicateForm,
  parseStatusForm,
  type StatusField,
} from "@/lib/feedback";
import { isUuid, text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

// Each action checks the admin role itself; the database functions check it
// again (they refuse anyone else).

export type StatusState = FormState<StatusField>;
export type DuplicateState = FormState<"main">;

export async function setFeedbackStatusAction(
  _previous: StatusState,
  form: FormData,
): Promise<StatusState> {
  await requireRole("admin");
  const parsed = parseStatusForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  const { id, status, note } = parsed.value;
  const result = await setFeedbackStatus(id, status, note);
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { status, note: note ?? "" },
    };
  }
  // Shipping queues "it's live" emails; send them now rather than at the
  // next scheduled run.
  if (status === "shipped") sendEmailsAfterResponse();
  refresh();
  return { status: "success", message: "Saved." };
}

export async function markFeedbackDuplicateAction(
  _previous: DuplicateState,
  form: FormData,
): Promise<DuplicateState> {
  await requireRole("admin");
  const parsed = parseDuplicateForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  const result = await markFeedbackDuplicate(
    parsed.value.id,
    parsed.value.mainNumber,
  );
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { main: String(parsed.value.mainNumber) },
    };
  }
  // Merging into a request that already shipped tells its sender at once.
  sendEmailsAfterResponse();
  refresh();
  return { status: "success", message: "Merged." };
}

export async function unmarkFeedbackDuplicateAction(
  form: FormData,
): Promise<void> {
  await requireRole("admin");
  const id = text(form, "id");
  if (!isUuid(id)) return;
  await unmarkFeedbackDuplicate(id);
  refresh();
}
