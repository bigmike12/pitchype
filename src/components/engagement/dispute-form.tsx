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

import type { DisputeState } from "@/lib/open-dispute";

/**
 * Opens a dispute; an admin then decides. The same form for both sides: the
 * page passes its own Server Action and the sentence that says what the
 * dispute is about and what happens next.
 */
export function DisputeForm({
  engagementId,
  action,
  intro,
}: {
  engagementId: string;
  action: (previous: DisputeState, form: FormData) => Promise<DisputeState>;
  intro: string;
}) {
  const [state, formAction, pending] = useActionState<DisputeState, FormData>(
    action,
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
        <p>{intro}</p>
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
          onScreenshotsChange={() => setPictureError(undefined)}
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
