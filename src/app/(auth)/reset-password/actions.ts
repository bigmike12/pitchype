"use server";

import { redirect } from "next/navigation";

import { updatePassword } from "@/lib/auth";
import { parseNewPasswordForm } from "@/lib/credentials";
import type { FormState } from "@/lib/form-data";

export type ResetPasswordState = FormState<"password">;

// Only reachable with the session the emailed reset link created; proxy.ts
// sends anyone without a session to /login, and updatePassword checks again.
export async function resetPasswordAction(
  _previous: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const parsed = parseNewPasswordForm(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const result = await updatePassword(parsed.value.password);
  if (result.ok) redirect("/home");

  const message = {
    weak_password:
      "Choose a stronger password: at least 8 characters, and not one that’s easy to guess.",
    same_password: "That’s your current password. Choose a new one.",
    signed_out:
      "Your reset link has expired. Request a new one from the login page.",
    unavailable:
      "We couldn’t change your password just now. Please try again in a minute.",
  }[result.reason];
  return { status: "error", message };
}
