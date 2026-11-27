"use client";

import { Bug, Lightbulb } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS } from "@/lib/feedback";

import { sendFeedback, type FeedbackState } from "./actions";

const KIND_OPTIONS = [
  {
    ...FEEDBACK_KINDS[0],
    description: "Something that would make Pitchype better for you.",
    icon: Lightbulb,
    tone: "sun",
  },
  {
    ...FEEDBACK_KINDS[1],
    description: "A page, a button or a step that isn’t doing what it should.",
    icon: Bug,
    tone: "peach",
  },
] as const;

export function FeedbackForm() {
  const [state, formAction, pending] = useActionState<FeedbackState, FormData>(
    sendFeedback,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="space-y-5">
      <ChoiceGroup
        legend="What would you like to send?"
        name="kind"
        variant="cards"
        options={KIND_OPTIONS}
        defaultValue={state.values?.kind ?? "idea"}
        required
        error={state.errors?.kind}
      />
      <TextField
        label="Title"
        name="title"
        required
        minLength={FEEDBACK_LIMITS.titleMin}
        maxLength={FEEDBACK_LIMITS.titleMax}
        hint="A few words, like “Pay by bank transfer”."
        defaultValue={state.values?.title}
        error={state.errors?.title}
      />
      <TextAreaField
        label="Details"
        name="details"
        rows={5}
        required
        minLength={FEEDBACK_LIMITS.detailsMin}
        maxLength={FEEDBACK_LIMITS.detailsMax}
        hint="What you’re trying to do, and what would help. For a problem, the page you were on."
        defaultValue={state.values?.details}
        error={state.errors?.details}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send to the team"}
      </Button>
    </form>
  );
}
