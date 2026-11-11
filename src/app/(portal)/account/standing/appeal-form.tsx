"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { appealAction, type AppealState } from "./actions";

export function AppealForm() {
  const [state, formAction, pending] = useActionState<AppealState, FormData>(
    appealAction,
    { status: "idle" },
  );
  return (
    <form action={formAction} className="space-y-4">
      <TextAreaField
        label="Your appeal"
        name="message"
        rows={4}
        maxLength={1000}
        required
        hint="Tell us which strike you think is wrong and why, for example a number that was an order code, not a phone number."
        defaultValue={state.values?.message}
        error={state.errors?.message}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send appeal"}
      </Button>
    </form>
  );
}
