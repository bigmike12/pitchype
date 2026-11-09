"use client";

import { Lock, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";
import { PasswordField } from "@/components/ui/password-field";
import { MIN_PASSWORD_LENGTH } from "@/lib/credentials";

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

  if (state.status === "success") {
    return (
      <Notice icon={MailCheck} title="Check your email">
        <p>
          We sent a link to{" "}
          <strong className="text-ink">{state.values?.email}</strong>. Open it
          to confirm your address and finish setting up. It expires in an hour.
        </p>
        <p className="mt-3 text-sm text-muted">
          Already have an account with this email?{" "}
          <Link href="/login" className="link">
            Log in instead
          </Link>
          .
        </p>
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <ChoiceGroup
        legend="I’m joining as"
        name="role"
        options={ROLES}
        defaultValue={state.values?.role}
        required
        error={state.errors?.role}
      />

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

      <PasswordField
        label="Password"
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
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
