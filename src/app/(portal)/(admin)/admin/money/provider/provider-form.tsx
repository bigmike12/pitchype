"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import type { PaymentProvider } from "@/lib/db/money";
import { providerName } from "@/lib/provider-words";

import { setPaymentProviderAction, type ProviderState } from "../actions";

/**
 * Switches which provider new card payments, bank transfers and payouts start
 * on. The server checks the provider is set up and the reason again.
 */
export function ProviderForm({ active }: { active: PaymentProvider }) {
  const other: PaymentProvider = active === "cray" ? "paystack" : "cray";
  const [state, formAction, pending] = useActionState<ProviderState, FormData>(
    setPaymentProviderAction,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <input type="hidden" name="provider" value={other} />
      <TextAreaField
        id="provider-reason"
        label={`Why switch to ${providerName(other)}`}
        name="reason"
        required
        minLength={3}
        maxLength={500}
        rows={3}
        defaultValue={state.values?.reason}
        error={state.errors?.reason}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending}>
        {pending
          ? "Switching…"
          : `Switch new payments to ${providerName(other)}`}
      </Button>
    </form>
  );
}
