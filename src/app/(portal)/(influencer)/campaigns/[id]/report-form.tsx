"use client";

import { Flag } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { reportCampaignAction, type CampaignReportState } from "./actions";

const REASONS = [
  { value: "scam_or_fraud", label: "Looks like a scam" },
  { value: "off_platform_contact", label: "Asks to deal outside Pitchype" },
  {
    value: "banned_content",
    label: "Gambling, adult content or a get-rich-quick scheme",
  },
  { value: "misleading", label: "Misleading or not what it seems" },
  { value: "other", label: "Something else" },
] as const;

export function CampaignReportForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState<
    CampaignReportState,
    FormData
  >(reportCampaignAction, { status: "idle" });
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <details className="rounded-card bg-surface-soft">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-card px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <Flag className="size-4" aria-hidden="true" />
        Report this campaign
      </summary>
      <div className="px-4 pb-5">
        {state.status === "success" ? (
          <FormMessage status="success" message={state.message} />
        ) : (
          <form action={formAction} className="space-y-5 pt-2">
            <input type="hidden" name="campaignId" value={campaignId} />
            <ChoiceGroup
              legend="What’s wrong?"
              name="reason"
              variant="cards"
              options={REASONS}
              defaultValue={values.reason}
              required
              error={errors.reason}
            />
            <TextAreaField
              id="campaign-report-note"
              label="Anything else we should know?"
              optional
              name="note"
              rows={3}
              maxLength={500}
              defaultValue={values.note}
              error={errors.note}
            />
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
