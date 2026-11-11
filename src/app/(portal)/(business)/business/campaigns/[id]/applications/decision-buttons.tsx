"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

import {
  approveAction,
  rejectAction,
  type ApproveState,
  type DecisionState,
} from "./actions";

/**
 * Approve, after a confirmation (a native dialog) showing what the business
 * agrees to pay. The price sent back is the one shown, so a price the
 * creator changed meanwhile is refused rather than approved unseen.
 */
export function ApproveButton({
  applicationId,
  creatorName,
  priceKobo,
}: {
  applicationId: string;
  creatorName: string;
  priceKobo: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<ApproveState, FormData>(
    approveAction,
    { status: "idle" },
  );
  const fees = feeExample(priceKobo);

  return (
    <>
      <Button type="button" onClick={() => dialogRef.current?.showModal()}>
        Hire
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`hire-${applicationId}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card bg-canvas p-0 text-body backdrop:bg-ink/40"
      >
        <form action={formAction} className="p-6">
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="expectedPriceKobo" value={priceKobo} />
          <h2 id={`hire-${applicationId}`} className="text-display-md">
            Hire {creatorName}?
          </h2>
          <dl className="mt-5 space-y-2">
            <div className="flex justify-between gap-4">
              <dt>Agreed price</dt>
              <dd className="font-semibold text-ink">
                {formatNaira(fees.agreedPriceKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Our fee (not refundable)</dt>
              <dd className="font-semibold text-ink">
                {formatNaira(fees.businessFeeKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hairline pt-2">
              <dt className="font-semibold text-ink">You pay</dt>
              <dd className="font-semibold text-ink">
                {formatNaira(fees.businessPaysKobo)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm">
            Next you pay into escrow. The creator starts work only once it’s
            paid. If you don’t pay within 48 hours, the hire lapses.
          </p>
          <div className="mt-4">
            <FormMessage status={state.status} message={state.message} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Hiring…" : "Hire and pay"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Not yet
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Reject, with an optional note the creator sees. */
export function RejectForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    rejectAction,
    { status: "idle" },
  );
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink underline-offset-4 hover:underline">
        Pass on this creator
      </summary>
      <form action={formAction} className="mt-3 max-w-md space-y-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <TextAreaField
          label="Note to the creator"
          name="note"
          optional
          rows={2}
          maxLength={500}
          hint="A short, kind reason helps them next time."
          defaultValue={state.values?.note}
          error={state.errors?.note}
        />
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Pass"}
        </Button>
      </form>
    </details>
  );
}
