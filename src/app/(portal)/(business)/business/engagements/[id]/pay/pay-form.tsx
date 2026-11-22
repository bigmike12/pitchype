"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { formatNaira } from "@/lib/money";

import { payAction, type PayState } from "./actions";

/**
 * The pay button and the fee confirmation. The tick box is checked again on
 * the server; the browser's `required` only saves a round trip.
 */
export function PayForm({
  engagementId,
  cardAmountKobo,
  perClick = false,
}: {
  engagementId: string;
  cardAmountKobo: number;
  /** A per-click hire: the fee is kept only on what's spent. */
  perClick?: boolean;
}) {
  const [state, formAction, pending] = useActionState<PayState, FormData>(
    payAction,
    { status: "idle" },
  );
  const fromWallet = cardAmountKobo === 0;

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="engagementId" value={engagementId} />
      <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
        <input
          type="checkbox"
          name="feeNoticeSeen"
          required
          className="mt-1 size-5 accent-ink"
        />
        <span className="text-ink">
          {perClick
            ? "I understand Pitchype keeps 5% of what’s spent, at least ₦500 or the card charge."
            : "I understand Pitchype’s fee isn’t refundable if I cancel after paying."}
        </span>
      </label>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending
          ? "One moment…"
          : fromWallet
            ? "Pay from your wallet"
            : `Pay ${formatNaira(cardAmountKobo)} by card`}
      </Button>
    </form>
  );
}
