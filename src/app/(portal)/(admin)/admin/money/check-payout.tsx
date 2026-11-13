"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

import { checkPayoutAction, type CheckPayoutState } from "./actions";

/**
 * "Check with Paystack" for a payout still processing. Rendered for every
 * decided payout so the answer stays on screen after the page refreshes and
 * the payout is no longer processing; the button shows only while it is.
 */
export function CheckPayout({
  payoutId,
  processing,
}: {
  payoutId: string;
  processing: boolean;
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
          {pending ? "Checking…" : "Check with Paystack"}
        </Button>
      )}
    </form>
  );
}
