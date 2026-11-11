"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { standingDecisionAction, type StandingDecisionState } from "./actions";

const LABELS = {
  void: { button: "Remove strike", reason: "Why it was a mistake" },
  lift: {
    button: "Lift suspension",
    reason: "Why (the person won’t see this)",
  },
  answer: { button: "Answer", reason: "Your answer (they see this)" },
  decline: { button: "Decline appeal", reason: "Your answer (they see this)" },
} as const;

/**
 * One admin decision on someone's standing, with the written reason the
 * database requires. Tucked into a disclosure so nothing happens by a
 * stray click.
 */
export function StandingDecision({
  decision,
  target,
}: {
  decision: keyof typeof LABELS;
  target: string;
}) {
  const [state, formAction, pending] = useActionState<
    StandingDecisionState,
    FormData
  >(standingDecisionAction, { status: "idle" });
  const label = LABELS[decision];

  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
        {label.button}
      </summary>
      <form action={formAction} className="mt-2 max-w-md space-y-3">
        <input type="hidden" name="decision" value={decision} />
        <input type="hidden" name="target" value={target} />
        <TextField
          id={`${decision}-${target}-reason`}
          label={label.reason}
          name="reason"
          required
          defaultValue={state.values?.reason}
          error={state.errors?.reason}
        />
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : label.button}
        </Button>
      </form>
    </details>
  );
}
