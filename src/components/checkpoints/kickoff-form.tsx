"use client";

import { startTransition, useActionState, useState } from "react";

import {
  formDataWithShrunkScreenshots,
  ProofFields,
} from "@/components/engagement/proof-fields";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import type { EvidenceFormState } from "@/lib/checkpoint-form";

export const KICKOFF_NOTE_MAX = 500;

/**
 * The kickoff: two confirmations, and optionally a note and up to three
 * screenshots (the product arrived, the shoot is booked). Nothing to review
 * and nothing here changes what the job pays.
 */
export function KickoffForm({
  engagementId,
  action,
}: {
  engagementId: string;
  action: (
    previous: EvidenceFormState,
    form: FormData,
  ) => Promise<EvidenceFormState>;
}) {
  const [state, formAction, pending] = useActionState<
    EvidenceFormState,
    FormData
  >(action, { status: "idle" });
  const [preparing, setPreparing] = useState(false);
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
    <form action={formAction} onSubmit={send} className="space-y-4">
      <input type="hidden" name="engagementId" value={engagementId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          Confirm to start the checkpoints
        </legend>
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            name="confirmedBrief"
            className="size-5 accent-ink"
          />
          I’ve read the brief and know what to make.
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            name="confirmedStarted"
            className="size-5 accent-ink"
          />
          I’ve started, or scheduled, the work.
        </label>
        {state.errors?.confirm && (
          <p role="alert" className="text-sm text-danger">
            {state.errors.confirm}
          </p>
        )}
      </fieldset>
      <TextAreaField
        id={`kickoff-${engagementId}-note`}
        name="note"
        label="Note"
        optional
        rows={2}
        maxLength={KICKOFF_NOTE_MAX}
        hint="Anything the business should know. No contact details."
        error={state.errors?.note}
      />
      <ProofFields
        idPrefix={`kickoff-${engagementId}`}
        showLinks={false}
        maxScreenshots={3}
        onScreenshotsChange={() => setPictureError(undefined)}
        errors={{ screenshots: pictureError ?? state.errors?.screenshots }}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending || preparing}>
        {preparing
          ? "Preparing…"
          : pending
            ? "Sending…"
            : "Confirm the kickoff"}
      </Button>
    </form>
  );
}
