"use server";

import { signUp } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { parseSignUpForm } from "@/lib/credentials";
import type { FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";

export type SignUpState = FormState<"email" | "password" | "role">;

const isRateLimited = createRateLimiter({
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
});

const MESSAGES = {
  weak_password:
    "Choose a stronger password: at least 8 characters, and not one that’s easy to guess.",
  email_rejected:
    "We can’t send email to that address. Check it, or use a different one.",
  rate_limited: "Too many tries. Wait a few minutes, then try again.",
  unavailable:
    "We couldn’t create your account just now. Please try again in a minute.",
} as const;

export async function signUpAction(
  _previous: SignUpState,
  form: FormData,
): Promise<SignUpState> {
  const parsed = parseSignUpForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  const { email, role } = parsed.value;
  if (isRateLimited(await clientIp())) {
    return {
      status: "error",
      message: MESSAGES.rate_limited,
      values: { email, role },
    };
  }

  const result = await signUp(parsed.value);
  if (!result.ok) {
    return {
      status: "error",
      message: MESSAGES[result.reason],
      values: { email, role },
    };
  }
  return { status: "success", values: { email } };
}
