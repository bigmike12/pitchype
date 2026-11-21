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
import { Callout } from "@/components/ui/callout";
import { MetricsFields } from "@/components/checkpoints/metrics-fields";
import {
  FINAL_REQUIREMENT_LABELS,
  REPORT_MAX,
  REPORT_MIN,
  type FinalRequirement,
} from "@/lib/checkpoints";
import type { Platform } from "@/lib/creator-profile";
import { MAX_PROOF_NOTE_LENGTH } from "@/lib/proof";
import { CalendarClock } from "lucide-react";

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
  finalRequirements = [],
  platforms = [],
  outstanding = [],
}: {
  engagementId: string;
  deliverables: Deliverable[];
  deliverBy: string;
  resubmit: boolean;
  roundsLeft: number;
  /** What the campaign says the final submission must contain; empty means a link or a screenshot. */
  finalRequirements?: FinalRequirement[];
  /** The platforms the job posts on, for the analytics fields. */
  platforms?: Platform[];
  /** Kickoff and checkpoints whose time has passed with no evidence: they come first. */
  outstanding?: string[];
}) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitWorkAction,
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

      {outstanding.length > 0 && (
        <Callout
          tone="attention"
          icon={CalendarClock}
          title="Send these first, then your final work"
        >
          {outstanding.join(", ")} still need evidence. Late is fine, and no
          money is held back because of it.
        </Callout>
      )}
      {finalRequirements.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-ink">
            The final submission needs
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-body">
            {finalRequirements.map((r) => (
              <li key={r}>{FINAL_REQUIREMENT_LABELS[r]}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-2 font-semibold text-ink">What the job asked for</h3>
        <DeliverableList
          deliverables={deliverables}
          postFrom={null}
          deliverBy={deliverBy}
        />
      </div>

      <ProofFields
        idPrefix="submit"
        linksOptional={
          finalRequirements.length > 0 &&
          !finalRequirements.includes("content_links")
        }
        onScreenshotsChange={() => setPictureError(undefined)}
        errors={{
          ...state.errors,
          screenshots: pictureError ?? state.errors?.screenshots,
        }}
      />
      {finalRequirements.includes("analytics") && (
        <MetricsFields
          idPrefix="submit"
          platforms={platforms}
          capturedOnRequired
          errors={state.errors}
        />
      )}
      {finalRequirements.includes("final_report") && (
        <TextAreaField
          id="submit-report"
          name="report"
          label="Final report"
          rows={5}
          maxLength={REPORT_MAX}
          hint={`How it went, in ${REPORT_MIN} to ${REPORT_MAX.toLocaleString("en-NG")} characters. No contact details.`}
          error={state.errors?.report}
        />
      )}
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
      <Button
        type="submit"
        size="lg"
        disabled={pending || preparing || outstanding.length > 0}
      >
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
