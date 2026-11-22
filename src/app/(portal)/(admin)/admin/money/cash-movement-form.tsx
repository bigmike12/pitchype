"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { recordCashMovementAction, type CashMovementState } from "./actions";

const PLACES = [
  { value: "paystack", label: "Paystack" },
  { value: "cray", label: "Cray" },
  { value: "bank", label: "Our bank account" },
];

/**
 * Records money moved between Paystack, Cray and our bank (say, topping up
 * Cray from the bank so payouts can go out), so each provider's
 * reconciliation stays true. Tucked into a disclosure so nothing happens by a
 * stray click. The server checks every field again.
 */
export function CashMovementForm() {
  const [state, formAction, pending] = useActionState<
    CashMovementState,
    FormData
  >(recordCashMovementAction, { status: "idle" });

  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-hairline-strong bg-surface px-5 text-[0.9375rem] font-semibold text-ink shadow-card">
        Record cash moved
      </summary>
      <form action={formAction} className="mt-3 max-w-md space-y-4">
        <SelectField
          id="cash-from"
          label="From"
          name="from"
          placeholder="Choose where it left"
          options={PLACES}
        />
        <SelectField
          id="cash-to"
          label="To"
          name="to"
          placeholder="Choose where it went"
          options={PLACES}
        />
        <TextField
          id="cash-amount"
          label="Amount (₦)"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="100,000"
          defaultValue={state.values?.amount}
          error={state.errors?.amount}
        />
        <TextAreaField
          id="cash-reason"
          label="Reason (kept on the record)"
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          defaultValue={state.values?.reason}
          error={state.errors?.reason}
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
          <input
            type="checkbox"
            name="confirm"
            required
            className="mt-1 size-5 accent-ink"
          />
          <span className="text-ink">
            The money has really moved. This changes what the ledger expects
            each provider to hold.
          </span>
        </label>
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record it"}
        </Button>
      </form>
    </details>
  );
}
