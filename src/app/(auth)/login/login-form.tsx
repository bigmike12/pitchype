"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { PasswordField } from "@/components/ui/password-field";

import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    { status: "idle" },
  );

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

      <PasswordField
        label="Password"
        name="password"
        icon={Lock}
        autoComplete="current-password"
        required
        error={state.errors?.password}
        labelAside={
          <Link href="/forgot-password" className="link font-medium">
            Forgot your password?
          </Link>
        }
      />

      <FormMessage status={state.status} message={state.message} />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
