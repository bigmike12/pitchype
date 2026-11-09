"use client";

import { Mail, MailCheck } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";

import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(forgotPasswordAction, { status: "idle" });

  if (state.status === "success") {
    return (
      <Notice icon={MailCheck} title="Check your email">
        <p>
          If there’s an account for{" "}
          <strong className="text-ink">{state.values?.email}</strong>, we’ve
          sent a link to choose a new password. It expires in an hour.
        </p>
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <TextField
        label="Email address"
        name="email"
        type="email"
        icon={Mail}
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={state.values?.email}
        error={state.errors?.email}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
