"use client";

import { startTransition, useActionState, useState } from "react";

import {
  formDataWithShrunkScreenshots,
  ProofFields,
} from "@/components/engagement/proof-fields";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MAX_PROOF_NOTE_LENGTH } from "@/lib/proof";

import { recordClickProofAction, type SubmitState } from "./actions";

/**
 * Where a per-click creator posted their link: links and screenshots for the
 * record. Nobody approves it and it doesn't change what they're paid; the
 * business sees it, and can raise a problem during the hold.
 */
export function ClickProofForm({ engagementId }: { engagementId: string }) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    recordClickProofAction,
    { status: "idle" },
  );
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
    <form
      action={formAction}
      onSubmit={send}
      className="space-y-5 rounded-card panel p-5 sm:p-6"
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <div>
        <h2 className="text-display-md">Add where you posted</h2>
        <p className="mt-1">
          Links to your posts or screenshots of them, so the business can see
          where its link went. Add more any time while your link is live.
        </p>
      </div>
      <ProofFields
        idPrefix="click-proof"
        onScreenshotsChange={() => setPictureError(undefined)}
        errors={{
          ...state.errors,
          screenshots: pictureError ?? state.errors?.screenshots,
        }}
      />
      <TextAreaField
        id="click-proof-note"
        name="note"
        label="Note"
        optional
        rows={2}
        maxLength={MAX_PROOF_NOTE_LENGTH}
        error={state.errors?.note}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending || preparing}>
        {preparing ? "Preparing…" : pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
