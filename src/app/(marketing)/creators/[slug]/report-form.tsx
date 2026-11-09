"use client";

import { Flag } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { describedBy, FieldLabel, FieldMessages } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MAX_REPORT_NOTE_LENGTH, REPORT_REASONS } from "@/lib/creator-profile";
import { cn } from "@/lib/utils";

import { reportCreatorAction, type ReportState } from "./actions";

/**
 * "Report this profile", tucked into a disclosure so it's there for the few
 * who need it. <details> opens without JavaScript.
 */
export function ReportForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState<ReportState, FormData>(
    reportCreatorAction,
    { status: "idle" },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <details className="group rounded-card bg-surface-soft">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-card px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <Flag className="size-4" aria-hidden="true" />
        Report this profile
      </summary>
      <div className="px-4 pb-5">
        {state.status === "success" ? (
          <FormMessage status="success" message={state.message} />
        ) : (
          <form action={formAction} className="space-y-5 pt-2">
            <input type="hidden" name="slug" value={slug} />
            <ChoiceGroup
              legend="What’s wrong?"
              name="reason"
              variant="cards"
              options={REPORT_REASONS}
              defaultValue={values.reason}
              required
              error={errors.reason}
            />
            <div>
              <FieldLabel htmlFor="report-note">
                Anything else we should know?{" "}
                <span className="font-normal text-muted">(optional)</span>
              </FieldLabel>
              <textarea
                id="report-note"
                name="note"
                rows={3}
                maxLength={MAX_REPORT_NOTE_LENGTH}
                defaultValue={values.note}
                aria-invalid={errors.note ? true : undefined}
                aria-describedby={describedBy(
                  "report-note",
                  undefined,
                  errors.note,
                )}
                className={cn(
                  "mt-2 block w-full rounded-control border bg-white px-4 py-3 text-base text-ink focus-visible:border-ink",
                  errors.note ? "border-danger" : "border-field",
                )}
              />
              <FieldMessages id="report-note" error={errors.note} />
            </div>
            <FormMessage status={state.status} message={state.message} />
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}
