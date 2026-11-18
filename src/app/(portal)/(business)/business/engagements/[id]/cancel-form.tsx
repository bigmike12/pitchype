"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { formatNaira } from "@/lib/money";

import { cancelFundedAction, type CancelFundedState } from "./actions";

/**
 * Cancel a paid hire that hasn't started. States exactly what comes back and
 * what doesn't, and needs the tick box before it will send (the server
 * checks the box again).
 */
export function CancelFundedForm({
  engagementId,
  priceKobo,
  feeKobo,
  perClick = false,
}: {
  engagementId: string;
  priceKobo: number;
  feeKobo: number;
  /** A per-click hire: most of the fee comes back too (fee kept on spend). */
  perClick?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    CancelFundedState,
    FormData
  >(cancelFundedAction, { status: "idle" });

  return (
    <details className="mt-8 border-t border-hairline pt-5">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-ink">
        Cancel this hire
      </summary>
      <form action={formAction} className="mt-3 max-w-md space-y-4">
        <input type="hidden" name="engagementId" value={engagementId} />
        <p>
          {perClick
            ? `You’ll get back ${formatNaira(priceKobo)} and our ${formatNaira(feeKobo)} fee, less ₦500 or the card charge, whichever is more.`
            : `You’ll get back ${formatNaira(priceKobo)}. Our fee of ${formatNaira(feeKobo)} isn’t refundable.`}
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
          <input
            type="checkbox"
            name="feeNoticeSeen"
            required
            className="mt-1 size-5 accent-ink"
          />
          <span className="text-ink">
            {perClick
              ? "I understand Pitchype keeps ₦500 or the card charge if I cancel."
              : "I understand Pitchype’s fee isn’t refundable if I cancel."}
          </span>
        </label>
        <FormMessage status={state.status} message={state.message} />
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          className="border-danger text-danger"
        >
          {pending ? "Cancelling…" : "Cancel this hire"}
        </Button>
      </form>
    </details>
  );
}
