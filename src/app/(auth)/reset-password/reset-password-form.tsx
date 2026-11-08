"use client";

import { useActionState } from "react";

import { FormCard, FormStatus } from "@/components/forms/fields";
import { PasswordField } from "@/components/forms/password-field";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/credentials";

import { resetPasswordAction, type ResetPasswordState } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPasswordAction, { status: "idle" });

  return (
    <FormCard>
      <form action={formAction} className="space-y-5">
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={state.errors?.password}
        />
        <FormStatus status={state.status} message={state.message} />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </FormCard>
  );
}
