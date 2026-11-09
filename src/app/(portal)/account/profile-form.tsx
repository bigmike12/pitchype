"use client";

import { Building2, MapPin, Store, UserRound } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { NIGERIAN_STATES, stateLabel, type Profile } from "@/lib/profile";

import type { ProfileState } from "./actions";

const STATE_OPTIONS = NIGERIAN_STATES.map((state) => ({
  value: state,
  label: stateLabel(state),
}));

/** Onboarding and the account page share this form; only the action and labels differ. */
export function ProfileForm({
  role,
  action,
  initial,
  submitLabel,
  pendingLabel,
}: {
  role: Profile["role"];
  action: (state: ProfileState, form: FormData) => Promise<ProfileState>;
  initial?: Profile;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    action,
    { status: "idle", values: initial ? toValues(initial) : undefined },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {role === "business" ? (
        <>
          <TextField
            label="Business name"
            name="businessName"
            icon={Store}
            autoComplete="organization"
            required
            maxLength={100}
            defaultValue={values.businessName}
            error={errors.businessName}
          />
          <TextField
            label="Your name"
            name="contactName"
            icon={UserRound}
            autoComplete="name"
            required
            maxLength={100}
            hint="The person creators will be talking to."
            defaultValue={values.contactName}
            error={errors.contactName}
          />
        </>
      ) : (
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
      )}

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

      <FormMessage status={state.status} message={state.message} />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

function toValues(profile: Profile): ProfileState["values"] {
  return profile.role === "business"
    ? {
        businessName: profile.businessName,
        contactName: profile.contactName,
        state: profile.state,
        city: profile.city,
      }
    : {
        displayName: profile.displayName,
        state: profile.state,
        city: profile.city,
      };
}
