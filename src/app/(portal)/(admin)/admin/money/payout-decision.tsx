"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import {
  approvePayoutAction,
  rejectPayoutAction,
  type PayoutDecisionState,
} from "./actions";

/**
 * Approve or reject one payout. Approving sends the money to the creator's
 * bank through Paystack; rejecting needs a written reason the creator sees and
 * puts the money back in their wallet. The server checks the reason again.
 */
export function PayoutDecision({ payoutId }: { payoutId: string }) {
  const [approval, approve, approving] = useActionState<
    PayoutDecisionState,
    FormData
  >(approvePayoutAction, { status: "idle" });
  const [rejection, reject, rejecting] = useActionState<
    PayoutDecisionState,
    FormData
  >(rejectPayoutAction, { status: "idle" });

  // Once approved the payout has moved on, so only the outcome is shown.
  if (approval.approved) {
    return <FormMessage status={approval.status} message={approval.message} />;
  }

  return (
    <div className="space-y-4">
      <form action={approve} className="space-y-2">
        <input type="hidden" name="payoutId" value={payoutId} />
        <FormMessage status={approval.status} message={approval.message} />
        <Button type="submit" disabled={approving || rejecting}>
          {approving ? "Approving…" : "Approve and send"}
        </Button>
      </form>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
          Reject
        </summary>
        <form action={reject} className="mt-2 max-w-md space-y-3">
          <input type="hidden" name="payoutId" value={payoutId} />
          <TextAreaField
            id={`reject-${payoutId}`}
            label="Why (the creator sees this)"
            name="reason"
            required
            maxLength={500}
            rows={3}
            defaultValue={rejection.values?.reason}
            error={rejection.errors?.reason}
          />
          <FormMessage status={rejection.status} message={rejection.message} />
          <Button
            type="submit"
            variant="secondary"
            disabled={approving || rejecting}
          >
            {rejecting ? "Rejecting…" : "Reject payout"}
          </Button>
        </form>
      </details>
    </div>
  );
}
