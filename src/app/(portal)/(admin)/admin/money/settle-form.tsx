"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { formatNaira } from "@/lib/money";
import {
  SETTLE_OUTCOMES,
  isSettleOutcome,
  parseNairaAmount,
  settlePreview,
} from "@/lib/settle-preview";

import { settleAction, type SettleState } from "./actions";

type Facts = {
  agreedPriceKobo: number;
  businessFeeKobo: number;
  creatorFeeBps: number;
  creatorMinFeeKobo: number;
  paystackChargeKobo: number;
};

/**
 * One admin settlement of a hire's escrow: the outcome, the amount for a
 * split, a written reason, and the exact result before anything is confirmed.
 * Tucked into a disclosure so nothing happens by a stray click. The server
 * checks every field again; the live line is only a preview of the same maths.
 */
export function SettleForm({
  engagementId,
  facts,
}: {
  engagementId: string;
  facts: Facts;
}) {
  const [outcome, setOutcome] = useState("");
  const [amount, setAmount] = useState("");
  const [state, formAction, pending] = useActionState<SettleState, FormData>(
    settleAction,
    { status: "idle" },
  );
  const idFor = (name: string) => `settle-${engagementId}-${name}`;

  let line: string | null = null;
  let problem: string | null = null;
  let warning: string | null = null;
  if (isSettleOutcome(outcome)) {
    const typed = outcome === "split" ? parseNairaAmount(amount) : null;
    if (typed && !typed.ok) {
      problem = amount.trim() === "" ? null : typed.error;
    } else {
      const preview = settlePreview({
        outcome,
        agreedPriceKobo: facts.agreedPriceKobo,
        releaseKobo: typed?.ok ? typed.kobo : null,
        businessFeeKobo: facts.businessFeeKobo,
        creatorFeeBps: facts.creatorFeeBps,
        creatorMinFeeKobo: facts.creatorMinFeeKobo,
        paystackChargeKobo: facts.paystackChargeKobo,
      });
      if (preview.ok) {
        line = `Creator receives ${formatNaira(preview.creatorGetsKobo)} after their ${formatNaira(preview.creatorFeeKobo)} fee · Business gets back ${formatNaira(preview.businessGetsBackKobo)} · Pitchype keeps ${formatNaira(preview.platformKeepsKobo)}`;
        warning = preview.warning;
      } else if (typed) {
        problem = preview.error;
      }
    }
  }

  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-hairline-strong bg-surface px-5 text-[0.9375rem] font-semibold text-ink shadow-card">
        Settle
      </summary>
      <form action={formAction} className="mt-3 max-w-md space-y-4">
        <input type="hidden" name="engagementId" value={engagementId} />
        <SelectField
          id={idFor("outcome")}
          label="What happens to the money"
          name="outcome"
          placeholder="Choose an outcome"
          options={SETTLE_OUTCOMES}
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          error={state.errors?.outcome}
        />
        {outcome === "split" && (
          <TextField
            id={idFor("amount")}
            label="Amount to release to the creator (₦)"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            placeholder="20,000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            hint={`The rest of the ${formatNaira(facts.agreedPriceKobo)} goes back to the business.`}
            error={state.errors?.amount ?? problem ?? undefined}
          />
        )}
        <TextAreaField
          id={idFor("reason")}
          label="Reason (kept on the record)"
          name="reason"
          required
          maxLength={500}
          rows={3}
          defaultValue={state.values?.reason}
          error={state.errors?.reason}
        />
        {line && (
          <p
            className="rounded-card bg-surface-soft p-3 text-ink"
            aria-live="polite"
          >
            {line}
          </p>
        )}
        {warning && <p className="font-medium text-danger">{warning}</p>}
        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
            <input
              type="checkbox"
              name="confirm"
              required
              className="mt-1 size-5 accent-ink"
            />
            <span className="text-ink">I’ve checked this.</span>
          </label>
          {state.errors?.confirm && (
            <p className="mt-1.5 text-sm font-medium text-danger">
              {state.errors.confirm}
            </p>
          )}
        </div>
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={pending || line === null}>
          {pending ? "Settling…" : "Settle this hire"}
        </Button>
      </form>
    </details>
  );
}
