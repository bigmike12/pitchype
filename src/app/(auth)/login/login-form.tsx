"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormCard, FormStatus, TextField } from "@/components/forms/fields";
import { PasswordField } from "@/components/forms/password-field";
import { Button } from "@/components/ui/button";

import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    { status: "idle" },
  );

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

        <div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            error={state.errors?.password}
          />
          <p className="mt-2 text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-ink underline underline-offset-4"
            >
              Forgot your password?
            </Link>
          </p>
        </div>

        <FormStatus status={state.status} message={state.message} />

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </FormCard>
  );
}
