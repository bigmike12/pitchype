"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import type { DecisionState } from "./actions";

type Choice = {
  value: string;
  label: string;
  variant?: "default" | "secondary";
};

/**
 * One admin decision: a written reason, a confirmation box and one or two
 * buttons. `hidden` carries the id of what is being decided; the button's
 * value arrives as `outcome`. The server checks all of it again.
 */
export function DecisionForm({
  action,
  id,
  hidden,
  choices,
  summary,
}: {
  action: (state: DecisionState, form: FormData) => Promise<DecisionState>;
  /** Makes the field ids unique on a page with many rows. */
  id: string;
  hidden: { name: string; value: string };
  choices: Choice[];
  summary: string;
}) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    action,
    { status: "idle" },
  );
  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
        {summary}
      </summary>
      <form action={formAction} className="mt-2 max-w-md space-y-3">
        <input type="hidden" name={hidden.name} value={hidden.value} />
        <TextAreaField
          id={`reason-${id}`}
          label="Reason (recorded with your name)"
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          defaultValue={state.values?.reason}
          error={state.errors?.reason}
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-3">
          <input
            type="checkbox"
            name="confirm"
            required
            className="mt-1 size-5 accent-ink"
          />
          <span className="text-ink">I’ve checked the details.</span>
        </label>
        <FormMessage status={state.status} message={state.message} />
        <div className="flex flex-wrap gap-3">
          {choices.map((choice) => (
            <Button
              key={choice.value}
              type="submit"
              name="outcome"
              value={choice.value}
              variant={choice.variant ?? "default"}
              disabled={pending}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </form>
    </details>
  );
}
