"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { BRIEF_MAX, GUIDELINES_MAX, MAX_PLACES } from "@/lib/campaign";

import { liveEditAction, type CampaignFormState } from "../../actions";

/**
 * What can change once a campaign is live: wording, places and later
 * deadlines. Price, requirements and deliverables are locked.
 */
export function LiveEditForm({
  campaign,
}: {
  campaign: {
    id: string;
    title: string;
    brief: string;
    guidelines: string | null;
    places: number;
    applicationsCloseOn: string;
    deliverBy: string;
  };
}) {
  const [state, formAction, pending] = useActionState<
    CampaignFormState,
    FormData
  >(liveEditAction, { status: "idle" });
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="campaignId" value={campaign.id} />
      <TextField
        label="Title"
        name="title"
        required
        maxLength={100}
        defaultValue={values.title ?? campaign.title}
        error={errors.title}
      />
      <TextAreaField
        label="Brief"
        name="brief"
        rows={6}
        maxLength={BRIEF_MAX}
        hint="Creators see that the brief was edited, and the old wording is kept."
        defaultValue={values.brief ?? campaign.brief}
        error={errors.brief}
      />
      <TextAreaField
        label="Notes for creators"
        optional
        name="guidelines"
        rows={3}
        maxLength={GUIDELINES_MAX}
        defaultValue={values.guidelines ?? campaign.guidelines ?? ""}
        error={errors.guidelines}
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          label="How many creators"
          name="places"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PLACES}
          defaultValue={values.places ?? String(campaign.places)}
          error={errors.places}
        />
        <TextField
          label="Applications close"
          name="applicationsCloseOn"
          type="date"
          min={campaign.applicationsCloseOn}
          hint="Later only."
          defaultValue={
            values.applicationsCloseOn ?? campaign.applicationsCloseOn
          }
          error={errors.applicationsCloseOn}
        />
        <TextField
          label="Posts up by"
          name="deliverBy"
          type="date"
          min={campaign.deliverBy}
          hint="Later only."
          defaultValue={values.deliverBy ?? campaign.deliverBy}
          error={errors.deliverBy}
        />
      </div>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
