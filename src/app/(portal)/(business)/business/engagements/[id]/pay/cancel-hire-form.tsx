"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

import { cancelHireAction, type CancelHireState } from "./actions";

/**
 * Cancel a hire before paying. The server may refuse (a payment still going
 * through holds the hire for 30 minutes); the reason shows next to the button.
 */
export function CancelHireForm({ engagementId }: { engagementId: string }) {
  const [state, formAction, pending] = useActionState<
    CancelHireState,
    FormData
  >(cancelHireAction, { status: "idle" });

  return (
    <details className="mt-8 border-t border-hairline pt-5">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-ink">
        Cancel this hire
      </summary>
      <p className="mt-3">
        Nothing has been paid, so nothing is charged. The creator is told, and
        the place goes back on offer.
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="engagementId" value={engagementId} />
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel hire"}
        </Button>
      </form>
    </details>
  );
}
