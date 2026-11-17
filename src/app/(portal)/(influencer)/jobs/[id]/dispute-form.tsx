"use client";

import { startTransition, useActionState, useState } from "react";

import {
  formDataWithShrunkScreenshots,
  ProofFields,
} from "@/components/engagement/proof-fields";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import {
  MAX_DISPUTE_REASON_LENGTH,
  MIN_DISPUTE_REASON_LENGTH,
} from "@/lib/proof";

import { openDisputeAction, type DisputeState } from "./actions";

/** Opens a dispute on work that was sent back; an admin then decides. */
export function DisputeForm({ engagementId }: { engagementId: string }) {
  const [state, formAction, pending] = useActionState<DisputeState, FormData>(
    openDisputeAction,
    { status: "idle" },
  );
  const [preparing, setPreparing] = useState(false);
  // Pictures too big to send in one request: caught here, before any upload.
  const [pictureError, setPictureError] = useState<string>();

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPictureError(undefined);
    setPreparing(true);
    const prepared = await formDataWithShrunkScreenshots(form);
    setPreparing(false);
    if (!prepared.ok) {
      setPictureError(prepared.message);
      return;
    }
    startTransition(() => formAction(prepared.data));
  }

  return (
    <details className="mt-8 border-t border-hairline pt-5">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-ink">
        Open a dispute
      </summary>
      <form
        action={formAction}
        onSubmit={send}
        className="mt-3 max-w-xl space-y-5"
      >
        <input type="hidden" name="engagementId" value={engagementId} />
        <p>
          If you think the business was wrong to send your work back, tell us
          why. An admin will read both sides and decide how the money is paid
          out. While a dispute is open you can’t send the work in again.
        </p>
        <TextAreaField
          id="dispute-reason"
          name="reason"
          label="What happened?"
          required
          rows={5}
          minLength={MIN_DISPUTE_REASON_LENGTH}
          maxLength={MAX_DISPUTE_REASON_LENGTH}
          hint={`${MIN_DISPUTE_REASON_LENGTH} to ${MAX_DISPUTE_REASON_LENGTH.toLocaleString("en-NG")} characters.`}
          error={state.errors?.reason}
        />
        <ProofFields
          idPrefix="dispute"
          linksOptional
          errors={{
            ...state.errors,
            screenshots: pictureError ?? state.errors?.screenshots,
          }}
        />
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={pending || preparing}>
          {preparing ? "Preparing…" : pending ? "Opening…" : "Open a dispute"}
        </Button>
      </form>
    </details>
  );
}
