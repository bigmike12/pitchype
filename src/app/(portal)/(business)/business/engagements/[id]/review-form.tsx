"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { formatNaira } from "@/lib/money";
import { MAX_DENIAL_REASONS } from "@/lib/proof";

import {
  acceptSubmissionAction,
  denySubmissionAction,
  type ReviewState,
} from "./actions";

/**
 * The two ways to answer work that is waiting for review. Accepting asks for
 * one more click that says exactly what happens to the money; sending it back
 * asks for one to five reasons the creator will see. Only one is open at a
 * time. The server checks the review is still open.
 */
export function ReviewForm({
  engagementId,
  creatorName,
  priceKobo,
}: {
  engagementId: string;
  creatorName: string;
  priceKobo: number;
}) {
  const [mode, setMode] = useState<"accept" | "deny" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          aria-expanded={mode === "accept"}
          onClick={() => setMode(mode === "accept" ? null : "accept")}
        >
          Accept the work
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={mode === "deny"}
          onClick={() => setMode(mode === "deny" ? null : "deny")}
        >
          Send it back
        </Button>
      </div>
      {mode === "accept" && (
        <AcceptForm
          engagementId={engagementId}
          creatorName={creatorName}
          priceKobo={priceKobo}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === "deny" && (
        <DenyForm
          engagementId={engagementId}
          creatorName={creatorName}
          onCancel={() => setMode(null)}
        />
      )}
    </div>
  );
}

/**
 * Accepting work the business sent back and the creator disputed: the same
 * confirmation, which also says the dispute closes. Shown on the dispute page.
 */
export function AcceptDisputedWork({
  engagementId,
  creatorName,
  priceKobo,
}: {
  engagementId: string;
  creatorName: string;
  priceKobo: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Accept the work
      </Button>
      {open && (
        <AcceptForm
          engagementId={engagementId}
          creatorName={creatorName}
          priceKobo={priceKobo}
          closesDispute
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AcceptForm({
  engagementId,
  creatorName,
  priceKobo,
  closesDispute = false,
  onCancel,
}: {
  engagementId: string;
  creatorName: string;
  priceKobo: number;
  closesDispute?: boolean;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    acceptSubmissionAction,
    { status: "idle" },
  );
  return (
    <form
      action={formAction}
      className="max-w-xl space-y-4 rounded-xl bg-surface-soft p-4"
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="text-ink">
        <span className="font-semibold tabular-nums">
          {formatNaira(priceKobo)}
        </span>{" "}
        {closesDispute
          ? `goes to ${creatorName} and the dispute closes. You can’t undo this.`
          : `goes to ${creatorName}. You can’t undo this.`}
      </p>
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Releasing…" : `Yes, release ${formatNaira(priceKobo)}`}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Not yet
        </Button>
      </div>
    </form>
  );
}

function DenyForm({
  engagementId,
  creatorName,
  onCancel,
}: {
  engagementId: string;
  creatorName: string;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    denySubmissionAction,
    { status: "idle" },
  );
  const [count, setCount] = useState(1);
  return (
    <form
      action={formAction}
      className="max-w-xl space-y-4 rounded-xl bg-surface-soft p-4"
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="text-ink">
        Tell {creatorName} what to change. They’ll see every reason you give.
      </p>
      {Array.from({ length: count }, (_, index) => (
        <TextField
          key={index}
          id={`deny-reason-${index + 1}`}
          name="reason"
          label={`Reason ${index + 1}`}
          required={index === 0}
          minLength={3}
          maxLength={500}
          autoComplete="off"
          hint={index === 0 ? "3 to 500 characters." : undefined}
          error={index === 0 ? state.errors?.reasons : undefined}
        />
      ))}
      {count < MAX_DENIAL_REASONS && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCount(count + 1)}
        >
          Add another reason
        </Button>
      )}
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send it back"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Not yet
        </Button>
      </div>
    </form>
  );
}
