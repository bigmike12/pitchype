"use server";

import { sendPasswordReset } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { parseEmailForm } from "@/lib/credentials";
import type { FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";

export type ForgotPasswordState = FormState<"email">;

const isRateLimited = createRateLimiter({
  maxAttempts: 3,
  windowMs: 10 * 60 * 1000,
});

export async function forgotPasswordAction(
  _previous: ForgotPasswordState,
  form: FormData,
): Promise<ForgotPasswordState> {
  const parsed = parseEmailForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  const { email } = parsed.value;
  if (isRateLimited(await clientIp())) {
    return {
      status: "error",
      message: "Too many tries. Wait a few minutes, then try again.",
      values: { email },
    };
  }

  // Same answer whether or not the account exists.
  await sendPasswordReset(email);
  return { status: "success", values: { email } };
}
