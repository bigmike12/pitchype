"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

import { withdrawAction, type JobActionState } from "./actions";

/** Withdraw from a paid job, before or after starting; the payment goes back. */
export function WithdrawForm({
  engagementId,
  businessName,
  afterStart,
}: {
  engagementId: string;
  businessName: string;
  /** Work has started: the business is refunded and the creator isn't paid. */
  afterStart: boolean;
}) {
  const [state, formAction, pending] = useActionState<JobActionState, FormData>(
    withdrawAction,
    { status: "idle" },
  );

  return (
    <details className="mt-8 border-t border-hairline pt-5">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-ink">
        Withdraw from this job
      </summary>
      <form action={formAction} className="mt-3 max-w-md space-y-4">
        <input type="hidden" name="engagementId" value={engagementId} />
        <p>
          {afterStart
            ? "The business gets its money back and you won’t be paid for this job."
            : `If you withdraw, the payment goes back to ${businessName}.`}{" "}
          This can’t be undone.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
          <input
            type="checkbox"
            name="withdrawConfirmed"
            required
            className="mt-1 size-5 accent-ink"
          />
          <span className="text-ink">I want to withdraw from this job.</span>
        </label>
        <FormMessage status={state.status} message={state.message} />
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          className="border-danger text-danger"
        >
          {pending ? "Withdrawing…" : "Withdraw from this job"}
        </Button>
      </form>
    </details>
  );
}
