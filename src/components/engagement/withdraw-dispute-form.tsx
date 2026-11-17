"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

import type { WithdrawDisputeState } from "@/lib/dispute-statement";

/**
 * The person who opened a dispute takes it back before it is decided. The
 * job goes back to where it was; no money moves.
 */
export function WithdrawDisputeForm({
  disputeId,
  action,
  backTo,
}: {
  disputeId: string;
  action: (
    previous: WithdrawDisputeState,
    form: FormData,
  ) => Promise<WithdrawDisputeState>;
  /** Where the job returns to, in words ("the work sent back", "in progress"). */
  backTo: string;
}) {
  const [state, formAction, pending] = useActionState<
    WithdrawDisputeState,
    FormData
  >(action, { status: "idle" });

  return (
    <details className="border-t border-hairline pt-5">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-ink">
        Withdraw this dispute
      </summary>
      <form action={formAction} className="mt-3 max-w-md space-y-4">
        <input type="hidden" name="disputeId" value={disputeId} />
        <p>
          The job goes back to where it was ({backTo}) and no money moves. An
          admin won’t decide it.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
          <input
            type="checkbox"
            name="withdrawConfirmed"
            required
            className="mt-1 size-5 accent-ink"
          />
          <span className="text-ink">I want to withdraw this dispute.</span>
        </label>
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Withdrawing…" : "Withdraw the dispute"}
        </Button>
      </form>
    </details>
  );
}
