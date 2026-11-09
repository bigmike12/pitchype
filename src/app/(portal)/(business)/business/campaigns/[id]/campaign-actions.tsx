"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { CampaignAction } from "@/lib/campaign";

import { campaignTransitionAction, type ActionState } from "../actions";

type Choice = {
  action: CampaignAction;
  label: string;
  variant?: "default" | "secondary" | "ghost";
};

/** The status buttons for one campaign; errors (e.g. a passed deadline) show underneath. */
export function CampaignActions({
  campaignId,
  choices,
}: {
  campaignId: string;
  choices: Choice[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    campaignTransitionAction,
    { status: "idle" },
  );
  if (choices.length === 0) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-wrap gap-3">
        {choices.map((choice) => (
          <Button
            key={choice.action}
            type="submit"
            name="action"
            value={choice.action}
            variant={choice.variant ?? "default"}
            disabled={pending}
          >
            {choice.label}
          </Button>
        ))}
      </div>
      <div className="mt-3">
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
