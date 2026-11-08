"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { FormCard, FormStatus, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";

import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(forgotPasswordAction, { status: "idle" });
  const doneRef = useRef<HTMLDivElement>(null);
  const done = state.status === "success";

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  if (done) {
    return (
      <FormCard>
        <div ref={doneRef} tabIndex={-1} role="status" className="flex gap-3">
          <MailCheck
            className="mt-0.5 size-6 shrink-0 text-brand-green"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-lg font-semibold">Check your email</h2>
            <p className="mt-1">
              If there’s an account for{" "}
              <strong className="text-ink">{state.values?.email}</strong>, we’ve
              sent a link to choose a new password. It expires in an hour.
            </p>
          </div>
        </div>
      </FormCard>
    );
  }

  return (
    <FormCard>
      <form action={formAction} className="space-y-5">
        <TextField
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <FormStatus status={state.status} message={state.message} />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </FormCard>
  );
}
