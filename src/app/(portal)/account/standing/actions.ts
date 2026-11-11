"use server";

import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth";
import { submitAppeal } from "@/lib/db/moderation";
import { text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

export type AppealState = FormState<"message">;

// One open appeal at a time, at most one a day; the database enforces both.
export async function appealAction(
  _previous: AppealState,
  form: FormData,
): Promise<AppealState> {
  await requireUser();
  const message = text(form, "message").trim();
  if (message.length < 2 || message.length > 1000) {
    return {
      status: "error",
      errors: { message: "Write 2 to 1,000 characters." },
      values: { message },
    };
  }
  const result = await submitAppeal(message);
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { message },
    };
  }
  refresh();
  return { status: "success", message: "Sent. We’ll answer here." };
}
