"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import {
  attachPayoutReferenceAction,
  type AttachReferenceState,
} from "./actions";

/**
 * For a Cray payout that may already have gone out (Cray rejected our
 * reference as a duplicate): the admin finds it in Cray's dashboard and pastes
 * Cray's own reference. It only sets the reference; the next check verifies it
 * with Cray before anything settles.
 */
export function AttachReference({ payoutId }: { payoutId: string }) {
  const [state, formAction, pending] = useActionState<
    AttachReferenceState,
    FormData
  >(attachPayoutReferenceAction, { status: "idle" });

  return (
    <form action={formAction} className="mt-3 max-w-md space-y-3">
      <input type="hidden" name="payoutId" value={payoutId} />
      <TextField
        id={`attach-${payoutId}`}
        label="Cray’s reference for this payout"
        name="reference"
        autoComplete="off"
        required
        maxLength={64}
        defaultValue={state.values?.reference}
        error={state.errors?.reference}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Attaching…" : "Attach Cray reference"}
      </Button>
    </form>
  );
}
