"use client";

import { Building2, MapPin, UserRound } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { NichePicker } from "@/components/creators/niche-picker";
import { Button } from "@/components/ui/button";
import {
  describedBy,
  FieldLabel,
  FieldMessages,
  SelectField,
  TextField,
} from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MAX_BIO_LENGTH, MAX_NICHES } from "@/lib/creator-profile";
import type { Niche } from "@/lib/db/creators";
import { NIGERIAN_STATES, stateLabel } from "@/lib/profile";
import { cn } from "@/lib/utils";

import { saveAboutAction, type AboutState } from "./actions";

const STATE_OPTIONS = NIGERIAN_STATES.map((state) => ({
  value: state,
  label: stateLabel(state),
}));

export function AboutForm({
  niches,
  initial,
}: {
  niches: Niche[];
  initial: AboutState["values"];
}) {
  const [state, formAction, pending] = useActionState<AboutState, FormData>(
    saveAboutAction,
    { status: "idle", values: initial },
  );
  const values = state.values ?? initial ?? {};
  const errors = state.errors ?? {};
  const [chosen, setChosen] = useState<string[]>(
    (initial?.niches ?? "").split(",").filter(Boolean),
  );
  const [bioLength, setBioLength] = useState((initial?.bio ?? "").length);

  return (
    <form
      action={formAction}
      // Submit by hand: React resets a form after its action, and the niche
      // checkboxes (controlled) would show their first values again while
      // React still holds the new ones, so the next save would drop them.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-6"
    >
      <TextField
        label="Display name"
        name="displayName"
        icon={UserRound}
        autoComplete="nickname"
        required
        maxLength={60}
        hint="The name your audience knows you by."
        defaultValue={values.displayName}
        error={errors.displayName}
      />

      <div>
        <FieldLabel
          htmlFor="bio"
          aside={
            <span
              className={cn(
                bioLength > MAX_BIO_LENGTH ? "text-danger" : "text-muted",
              )}
            >
              {bioLength}/{MAX_BIO_LENGTH}
            </span>
          }
        >
          Short bio
        </FieldLabel>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={MAX_BIO_LENGTH}
          defaultValue={values.bio}
          onChange={(event) => setBioLength(event.target.value.length)}
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby={describedBy("bio", "hint", errors.bio)}
          className={cn(
            "mt-2 block w-full rounded-control border bg-white px-4 py-3 text-base text-ink focus-visible:border-ink",
            errors.bio ? "border-danger" : "border-field",
          )}
        />
        <FieldMessages
          id="bio"
          hint="What you make and who watches. Businesses see this; keep phone numbers and emails out of it."
          error={errors.bio}
        />
      </div>

      <NichePicker
        niches={niches}
        chosen={chosen}
        onChange={setChosen}
        error={errors.niches}
        hint={`Choose up to ${MAX_NICHES}. These decide which searches you appear in.`}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="State"
          name="state"
          icon={MapPin}
          required
          placeholder="Choose your state"
          options={STATE_OPTIONS}
          defaultValue={values.state ?? ""}
          error={errors.state}
        />
        <TextField
          label="Town or city"
          name="city"
          icon={Building2}
          autoComplete="address-level2"
          required
          maxLength={60}
          defaultValue={values.city}
          error={errors.city}
        />
      </div>

      <TextField
        label="Starting rate (₦)"
        name="startingRate"
        inputMode="numeric"
        placeholder="50,000"
        hint="Your lowest price for a job. Businesses see “From ₦50,000”. Leave it blank if it’s negotiable."
        defaultValue={values.startingRate}
        error={errors.startingRate}
        className="max-w-xs"
      />

      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
