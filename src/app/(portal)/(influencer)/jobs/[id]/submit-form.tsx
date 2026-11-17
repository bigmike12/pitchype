"use client";

import { startTransition, useActionState, useState } from "react";

import { DeliverableList } from "@/components/campaigns/campaign-facts";
import {
  formDataWithShrunkScreenshots,
  ProofFields,
} from "@/components/engagement/proof-fields";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import type { Deliverable } from "@/lib/campaign";
import { MAX_PROOF_NOTE_LENGTH } from "@/lib/proof";

import { submitWorkAction, type SubmitState } from "./actions";

/**
 * Sends in proof of work: links and screenshots that show the deliverables,
 * and a note. Used for the first submission and for every resubmission after
 * a denial (the database allows up to three more).
 */
export function SubmitForm({
  engagementId,
  deliverables,
  deliverBy,
  resubmit,
  roundsLeft,
}: {
  engagementId: string;
  deliverables: Deliverable[];
  deliverBy: string;
  resubmit: boolean;
  roundsLeft: number;
}) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitWorkAction,
    { status: "idle" },
  );
  const [preparing, setPreparing] = useState(false);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPreparing(true);
    const data = await formDataWithShrunkScreenshots(form);
    setPreparing(false);
    startTransition(() => formAction(data));
  }

  return (
    <form
      action={formAction}
      onSubmit={send}
      className="space-y-5 rounded-card panel p-5 sm:p-6"
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <div>
        <h2 className="text-display-md">
          {resubmit ? "Send it again" : "Send in your work"}
        </h2>
        <p className="mt-1">
          {resubmit
            ? `Fix what the business asked for, then send it in again. ${roundsLeft} ${roundsLeft === 1 ? "resubmission" : "resubmissions"} left.`
            : "Show the business what you made. They have 7 days to review it; after that the money is released to you."}
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">What the job asked for</h3>
        <DeliverableList
          deliverables={deliverables}
          postFrom={null}
          deliverBy={deliverBy}
        />
      </div>

      <ProofFields idPrefix="submit" errors={state.errors} />
      <TextAreaField
        id="submit-note"
        name="note"
        label="Note"
        optional
        rows={3}
        maxLength={MAX_PROOF_NOTE_LENGTH}
        hint={`Anything the business should know. Up to ${MAX_PROOF_NOTE_LENGTH.toLocaleString("en-NG")} characters.`}
        error={state.errors?.note}
      />

      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending || preparing}>
        {preparing
          ? "Preparing…"
          : pending
            ? "Sending…"
            : resubmit
              ? "Send it again"
              : "Send in your work"}
      </Button>
    </form>
  );
}
