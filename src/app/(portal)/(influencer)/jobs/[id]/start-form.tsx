"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

import { startWorkAction, type JobActionState } from "./actions";

/**
 * Start work. Once it's pressed the creator can't cancel alone, so the tick
 * box is required (the server checks it again).
 */
export function StartWorkForm({ engagementId }: { engagementId: string }) {
  const [state, formAction, pending] = useActionState<JobActionState, FormData>(
    startWorkAction,
    { status: "idle" },
  );

  return (
    <form
      action={formAction}
      className="mt-4 space-y-4 rounded-card panel p-5 sm:p-6"
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <h2 className="text-display-md">Start work</h2>
      <p>Once you start, you can’t cancel on your own.</p>
      <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-4">
        <input
          type="checkbox"
          name="startConfirmed"
          required
          className="mt-1 size-5 accent-ink"
        />
        <span className="text-ink">
          I understand I can’t cancel on my own once I start.
        </span>
      </label>
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "One moment…" : "Start work"}
      </Button>
    </form>
  );
}
