"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { submitFeedback } from "@/lib/db/feedback";
import { parseFeedbackForm, type FeedbackField } from "@/lib/feedback";
import type { FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";
import { refusalText } from "@/lib/refusals";

export type FeedbackState = FormState<FeedbackField>;

const isRateLimited = createRateLimiter({
  name: "feedback",
  maxAttempts: 10,
  windowMs: 24 * 60 * 60 * 1000,
});

export async function sendFeedback(
  _previous: FeedbackState,
  form: FormData,
): Promise<FeedbackState> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin/feedback");

  const parsed = parseFeedbackForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  if (await isRateLimited(user.id)) {
    return {
      status: "error",
      message: "You’ve sent 10 requests today. Thank you! Send more tomorrow.",
      values: parsed.value,
    };
  }

  const result = await submitFeedback(parsed.value);
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: parsed.value,
    };
  }

  revalidatePath("/feedback");
  return {
    status: "success",
    message: `Thanks. We’ve got it as #${result.value.number}.`,
  };
}
