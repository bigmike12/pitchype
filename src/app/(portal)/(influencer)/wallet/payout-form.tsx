"use client";

import posthog from "posthog-js";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MIN_PAYOUT_KOBO, transferFee } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { parsePayoutAmount, payoutPreview } from "@/lib/payout-request";
import { refusalText } from "@/lib/refusals";
import { cn } from "@/lib/utils";

import { requestPayoutAction, type PayoutState } from "./actions";

/**
 * The payout request with a live line showing what lands in their bank. The
 * server reads the amount again and the database checks the balance; this
 * only saves a round trip and shows the cost before they confirm.
 */
export function PayoutForm({
  balanceKobo,
  hasBankAccount,
}: {
  balanceKobo: number;
  hasBankAccount: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [state, formAction, pending] = useActionState<PayoutState, FormData>(
    async (previous, form) => {
      const next = await requestPayoutAction(previous, form);
      if (next.status === "success") {
        const requested = parsePayoutAmount(String(form.get("amount") ?? ""));
        posthog.capture("payout_requested", {
          payout_amount_band:
            requested.ok && requested.kobo < 1_000_000
              ? "under_10000"
              : requested.ok && requested.kobo < 5_000_000
                ? "10000_to_49999"
                : "50000_plus",
        });
        setAmount("");
      }
      return next;
    },
    { status: "idle" },
  );

  const blocked = !hasBankAccount
    ? "Add a bank account above to ask for a payout."
    : balanceKobo < MIN_PAYOUT_KOBO
      ? `You can ask for a payout once your balance is ${formatNaira(MIN_PAYOUT_KOBO)} or more.`
      : null;

  const parsed = parsePayoutAmount(amount);
  let line: string;
  let problem = false;
  if (amount.trim() === "") {
    line = "Enter how much you want sent to your bank.";
  } else if (!parsed.ok) {
    line = parsed.error;
    problem = true;
  } else if (parsed.kobo > balanceKobo) {
    line = "That’s more than your balance.";
    problem = true;
  } else if (transferFee(parsed.kobo) >= parsed.kobo) {
    line = refusalText("payout_fee_too_high");
    problem = true;
  } else {
    const { feeKobo, receiveKobo } = payoutPreview(parsed.kobo);
    line = `You will receive ${formatNaira(receiveKobo)} after the ${formatNaira(feeKobo)} transfer cost.`;
  }

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {blocked && <p>{blocked}</p>}
      <TextField
        label="Amount (₦)"
        name="amount"
        inputMode="numeric"
        autoComplete="off"
        placeholder="25,000"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        disabled={blocked !== null}
        aria-describedby="payout-preview"
      />
      <p
        id="payout-preview"
        aria-live="polite"
        className={cn(
          "empty:hidden",
          problem ? "font-medium text-danger" : "text-ink",
        )}
      >
        {blocked === null ? line : ""}
      </p>
      <p className="text-sm text-muted">
        A member of our team approves each payout before it’s sent.
      </p>
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        disabled={
          pending || blocked !== null || problem || amount.trim() === ""
        }
      >
        {pending ? "One moment…" : "Ask for payout"}
      </Button>
    </form>
  );
}
