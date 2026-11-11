"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MAX_NOTE_LENGTH } from "@/lib/applications";
import { creatorReceivesKobo } from "@/lib/campaign";
import { formatNaira, KOBO_PER_NAIRA } from "@/lib/money";

import { applyAction, type ApplyState } from "./actions";

/**
 * Apply to a campaign, or (with `application`) change the price and note of
 * an application that hasn't been decided yet.
 */
export function ApplyForm({
  campaignId,
  campaignPriceKobo,
  application,
}: {
  campaignId: string;
  campaignPriceKobo: number;
  application?: {
    id: string;
    proposedPriceKobo: number | null;
    note: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyAction,
    { status: "idle" },
  );
  const priceKobo = application?.proposedPriceKobo ?? campaignPriceKobo;
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      {application && (
        <input type="hidden" name="applicationId" value={application.id} />
      )}
      <TextField
        label="Your price (₦)"
        name="price"
        inputMode="numeric"
        defaultValue={
          values.price ?? (priceKobo / KOBO_PER_NAIRA).toLocaleString("en-NG")
        }
        hint={`The campaign pays ${formatNaira(campaignPriceKobo)} (you’d receive ${formatNaira(creatorReceivesKobo(campaignPriceKobo))} after our 5% fee). Change it to propose your own price; the business decides.`}
        error={errors.price}
        className="max-w-xs"
      />
      <TextAreaField
        label="Note to the business"
        name="note"
        optional
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        defaultValue={values.note ?? application?.note ?? ""}
        hint="Why you’re a good fit, or what you’d make. Keep phone numbers and emails out: you’ll talk on Pitchype."
        error={errors.note}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending
          ? "Sending…"
          : application
            ? "Save changes"
            : "Apply to this campaign"}
      </Button>
    </form>
  );
}
