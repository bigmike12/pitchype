"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { parseLoginForm } from "@/lib/credentials";
import type { FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";

export type LoginState = FormState<"email" | "password">;

const isRateLimited = createRateLimiter({
  maxAttempts: 10,
  windowMs: 10 * 60 * 1000,
});

export async function loginAction(
  _previous: LoginState,
  form: FormData,
): Promise<LoginState> {
  const parsed = parseLoginForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  const { email } = parsed.value;
  const values = { email };
  if (isRateLimited(await clientIp())) {
    return {
      status: "error",
      message: "Too many tries. Wait a few minutes, then try again.",
      values,
    };
  }

  const result = await signIn(parsed.value);
  if (result.ok) {
    // /home sends people who haven’t finished onboarding on to it.
    redirect("/home");
  }

  const message = {
    invalid_credentials:
      "That email and password don’t match an account. Check them and try again.",
    email_not_confirmed: `Confirm your email first, using the link we emailed to ${email}. Can’t find it? Check your spam folder.`,
    rate_limited: "Too many tries. Wait a few minutes, then try again.",
    unavailable:
      "We couldn’t log you in just now. Please try again in a minute.",
  }[result.reason];

  return { status: "error", message, values };
}
