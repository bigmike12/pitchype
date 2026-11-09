"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { reviewVerificationAction, type ReviewState } from "./actions";

/** Verify (with the follower count seen) or reject one request. */
export function ReviewForm({
  requestId,
  movesBadge,
}: {
  requestId: string;
  /** Another account holds this handle's badge; verifying moves it here. */
  movesBadge: boolean;
}) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    reviewVerificationAction,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <TextField
        id={`count-${requestId}`}
        label="Followers you saw"
        name="followerCount"
        inputMode="numeric"
        hint="Needed to verify, not to reject."
        defaultValue={state.values?.followerCount}
        error={state.errors?.followerCount}
        className="max-w-xs"
      />
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="decision" value="verify" disabled={pending}>
          {movesBadge
            ? "Verify and move the badge here"
            : "Code is there: verify"}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="secondary"
          disabled={pending}
        >
          Code not found: reject
        </Button>
      </div>
    </form>
  );
}
