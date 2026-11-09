"use client";

import { Lock } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { PasswordField } from "@/components/ui/password-field";
import { MIN_PASSWORD_LENGTH } from "@/lib/credentials";

import { resetPasswordAction, type ResetPasswordState } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPasswordAction, { status: "idle" });

  return (
    <form action={formAction} className="space-y-5">
      <PasswordField
        label="New password"
        name="password"
        icon={Lock}
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={state.errors?.password}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
