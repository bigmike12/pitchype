"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  FieldMessages,
  FormCard,
  FormStatus,
  TextField,
} from "@/components/forms/fields";
import { PasswordField } from "@/components/forms/password-field";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/credentials";
import { cn } from "@/lib/utils";

import { signUpAction, type SignUpState } from "./actions";

const ROLES = [
  { value: "business", label: "A business" },
  { value: "influencer", label: "A creator" },
] as const;

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(
    signUpAction,
    { status: "idle" },
  );
  const doneRef = useRef<HTMLDivElement>(null);
  const done = state.status === "success";

  // The form is replaced by the message; move focus so it's announced.
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
              We sent a link to{" "}
              <strong className="text-ink">{state.values?.email}</strong>. Open
              it to confirm your address and finish setting up. It expires in an
              hour.
            </p>
            <p className="mt-3 text-sm text-muted">
              Already have an account with this email?{" "}
              <Link
                href="/login"
                className="font-medium text-ink underline underline-offset-4"
              >
                Log in instead
              </Link>
              .
            </p>
          </div>
        </div>
      </FormCard>
    );
  }

  const roleError = state.errors?.role;

  return (
    <FormCard>
      <form action={formAction} className="space-y-5">
        <fieldset aria-describedby={roleError ? "role-error" : undefined}>
          <legend className="font-semibold text-ink">I’m joining as</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ROLES.map((role) => (
              <label
                key={role.value}
                className={cn(
                  "inline-flex h-12 cursor-pointer items-center justify-center rounded-full border px-4 font-semibold text-ink",
                  "has-checked:border-ink has-checked:bg-ink has-checked:text-white",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
                  roleError ? "border-danger" : "border-field",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  defaultChecked={state.values?.role === role.value}
                  required
                  className="sr-only"
                />
                {role.label}
              </label>
            ))}
          </div>
          <FieldMessages name="role" error={roleError} />
        </fieldset>

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

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={state.errors?.password}
        />

        <FormStatus status={state.status} message={state.message} />

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      </form>
    </FormCard>
  );
}
