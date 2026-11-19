"use client";

import { Camera, Lock, Mail, MailCheck, Store } from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";
import { PasswordField } from "@/components/ui/password-field";
import { MIN_PASSWORD_LENGTH, type SignupRole } from "@/lib/credentials";

import { signUpAction, type SignUpState } from "./actions";

// What each account is for, in a line, because the choice can't be changed
// later (one role per account).
const ROLES = [
  {
    value: "business",
    label: "A business",
    description: "Post campaigns, choose creators and pay through escrow.",
    icon: Store,
    tone: "mint",
  },
  {
    value: "influencer",
    label: "A creator",
    description: "Find paid campaigns and get paid when your work is approved.",
    icon: Camera,
    tone: "lilac",
  },
] as const;

export function SignUpForm({
  initialRole,
}: {
  /** From the "I'm a business / creator" links and the audience pages: the account type is already chosen. */
  initialRole?: SignupRole;
}) {
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(
    async (previous, form) => {
      const next = await signUpAction(previous, form);
      const role = form.get("role");
      if (
        next.status === "success" &&
        (role === "business" || role === "influencer")
      ) {
        posthog.capture("signup_completed", { signup_role: role });
      }
      return next;
    },
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
      {initialRole ? (
        <>
          {/* A plain hidden field, so the role is submitted even before
              JavaScript has loaded. The server still validates it. */}
          <input type="hidden" name="role" value={initialRole} />
          <p className="text-lg text-ink">
            Signing up as{" "}
            <strong>
              {initialRole === "business" ? "a business" : "a creator"}
            </strong>
            .{" "}
            <Link href="/signup" className="link">
              Change
            </Link>
          </p>
        </>
      ) : (
        <ChoiceGroup
          legend="I’m joining as"
          name="role"
          options={ROLES}
          variant="cards"
          defaultValue={state.values?.role}
          required
          error={state.errors?.role}
        />
      )}

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
