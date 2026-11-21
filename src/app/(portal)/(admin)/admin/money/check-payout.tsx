"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { PaymentProvider } from "@/lib/db/money";
import { providerName } from "@/lib/provider-words";

import { checkPayoutAction, type CheckPayoutState } from "./actions";

/**
 * "Check with Paystack" or "Check with Cray" for a payout still processing. Rendered for every
 * decided payout so the answer stays on screen after the page refreshes and
 * the payout is no longer processing; the button shows only while it is.
 */
export function CheckPayout({
  payoutId,
  processing,
  provider,
}: {
  payoutId: string;
  processing: boolean;
  provider: PaymentProvider;
}) {
  const [state, formAction, pending] = useActionState<
    CheckPayoutState,
    FormData
  >(checkPayoutAction, { status: "idle" });

  if (!processing && state.status === "idle") return null;

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="payoutId" value={payoutId} />
      <FormMessage status={state.status} message={state.message} />
      {processing && (
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Checking…" : `Check with ${providerName(provider)}`}
        </Button>
      )}
    </form>
  );
}
