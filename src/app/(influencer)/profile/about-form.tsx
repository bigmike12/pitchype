"use client";

import { Building2, MapPin, UserRound } from "lucide-react";
import { useActionState, useState } from "react";

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

  function toggleNiche(slug: string, checked: boolean) {
    setChosen((current) =>
      checked ? [...current, slug] : current.filter((s) => s !== slug),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
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

      <fieldset
        aria-describedby={errors.niches ? "niches-error" : "niches-hint"}
      >
        <legend className="font-semibold text-ink">Niches</legend>
        <p id="niches-hint" className="mt-1 text-sm text-muted">
          Choose up to {MAX_NICHES}. These decide which searches you appear in.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {niches.map((niche) => {
            const checked = chosen.includes(niche.slug);
            const full = !checked && chosen.length >= MAX_NICHES;
            return (
              <label
                key={niche.slug}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-field bg-white px-4 text-sm font-medium text-ink",
                  "has-checked:border-ink has-checked:bg-ink has-checked:text-white",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
                  full
                    ? "cursor-not-allowed opacity-50"
                    : "not-has-checked:hover:bg-surface-card",
                )}
              >
                <input
                  type="checkbox"
                  name="niches"
                  value={niche.slug}
                  checked={checked}
                  disabled={full}
                  onChange={(event) =>
                    toggleNiche(niche.slug, event.target.checked)
                  }
                  className="sr-only"
                />
                {niche.name}
              </label>
            );
          })}
        </div>
        <FieldMessages id="niches" error={errors.niches} />
      </fieldset>

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
