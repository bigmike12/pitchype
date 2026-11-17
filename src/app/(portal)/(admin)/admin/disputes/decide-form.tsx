"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { formatNaira } from "@/lib/money";
import {
  SETTLE_OUTCOMES,
  describeSettlePreview,
  type SettleFacts,
} from "@/lib/settle-preview";

import { decideDisputeAction, type DecideState } from "./actions";

/**
 * An admin's decision on an open dispute: how the money is paid out, the
 * amount for a split, a written reason, and the exact result before anything
 * is confirmed. The same preview as the escrow settle form; the server checks
 * every field again and the database moves the money.
 */
export function DecideForm({
  disputeId,
  facts,
}: {
  disputeId: string;
  facts: SettleFacts;
}) {
  const [outcome, setOutcome] = useState("");
  const [amount, setAmount] = useState("");
  const [state, formAction, pending] = useActionState<DecideState, FormData>(
    decideDisputeAction,
    { status: "idle" },
  );

  const { line, problem, warning } = describeSettlePreview(
    outcome,
    amount,
    facts,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <input type="hidden" name="disputeId" value={disputeId} />
      <div className="space-y-2 rounded-card bg-surface-soft p-4 text-sm text-body">
        <p className="font-semibold text-ink">How to decide</p>
        <p>
          <span className="font-semibold text-ink">Creator at fault</span> means
          the creator didn’t deliver, delivered something clearly off the brief,
          or walked away after starting.
        </p>
        <p>
          A partial delivery is a{" "}
          <span className="font-semibold text-ink">split</span>.
        </p>
        <p>
          Work that met the brief is a{" "}
          <span className="font-semibold text-ink">full release</span>, even if
          the business changed its mind.
        </p>
      </div>
      <SelectField
        id="decide-outcome"
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
          id="decide-amount"
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
        id="decide-reason"
        label="Reason"
        name="reason"
        required
        maxLength={500}
        rows={4}
        hint="Both people will read this, and it is kept on the record."
        defaultValue={state.values?.reason}
        error={state.errors?.reason}
      />
      {/* Always on the page, so a screen reader hears the text change. */}
      <p
        aria-live="polite"
        className="rounded-card bg-surface-soft p-3 text-ink empty:hidden"
      >
        {line}
      </p>
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
        {pending ? "Deciding…" : "Decide this dispute"}
      </Button>
    </form>
  );
}
