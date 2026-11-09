"use client";

import { startTransition, useActionState, useState } from "react";

import { NichePicker } from "@/components/creators/niche-picker";
import { FormMessage } from "@/components/ui/form-message";
import type { Niche } from "@/lib/db/creators";

import { saveNichesAction, type NichesState } from "../actions";
import { StepActions, continueClass } from "../onboarding-step";

export function NichesForm({
  niches,
  initial,
}: {
  niches: Niche[];
  initial: string[];
}) {
  const [state, formAction, pending] = useActionState<NichesState, FormData>(
    saveNichesAction,
    { status: "idle" },
  );
  const [chosen, setChosen] = useState(initial);

  return (
    <form
      action={formAction}
      // Submit by hand: the pills are controlled, and React resets a form
      // after its action (see DESIGN_SYSTEM.md).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <NichePicker
        niches={niches}
        chosen={chosen}
        onChange={setChosen}
        error={state.errors?.niches}
        hint="You can change them later from your profile."
      />
      <div className="mt-5">
        <FormMessage status={state.status} message={state.message} />
      </div>
      <StepActions>
        <button type="submit" disabled={pending} className={continueClass}>
          {pending ? "Saving…" : "Continue"}
        </button>
      </StepActions>
    </form>
  );
}
