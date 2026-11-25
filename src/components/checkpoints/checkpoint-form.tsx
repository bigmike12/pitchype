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
import type { EvidenceType } from "@/lib/checkpoints";
import type { Platform } from "@/lib/creator-profile";
import { MAX_PROOF_NOTE_LENGTH } from "@/lib/proof";

import { MetricsFields } from "./metrics-fields";

/**
 * Evidence for one progress checkpoint: whatever the campaign asks for (a
 * written update, links, screenshots, analytics). The list above the form says
 * what is needed; the database checks it again. Late evidence is accepted and
 * recorded as late.
 */
export function CheckpointForm({
  hireCheckpointId,
  required,
  platforms,
  action,
}: {
  hireCheckpointId: string;
  required: EvidenceType[];
  platforms: Platform[];
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
  const analytics = required.includes("analytics");
  const needsLinks = required.includes("content_links");
  const prefix = `checkpoint-${hireCheckpointId}`;

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
      <input type="hidden" name="hireCheckpointId" value={hireCheckpointId} />
      <TextAreaField
        id={`${prefix}-note`}
        name="note"
        label={
          required.includes("progress_update") ? "Progress update" : "Note"
        }
        optional={!required.includes("progress_update")}
        rows={3}
        maxLength={MAX_PROOF_NOTE_LENGTH}
        hint={
          required.includes("progress_update")
            ? "What’s done and what’s next, in at least 20 characters. No contact details."
            : "Anything the business should know. No contact details."
        }
        error={state.errors?.note}
      />
      <ProofFields
        idPrefix={prefix}
        linksOptional={!needsLinks}
        onScreenshotsChange={() => setPictureError(undefined)}
        errors={{
          links: state.errors?.links,
          screenshots: pictureError ?? state.errors?.screenshots,
        }}
      />
      {analytics && (
        <MetricsFields
          idPrefix={prefix}
          platforms={platforms}
          capturedOnRequired
          errors={state.errors}
        />
      )}
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending || preparing}>
        {preparing
          ? "Preparing…"
          : pending
            ? "Sending…"
            : "Send this checkpoint"}
      </Button>
    </form>
  );
}
