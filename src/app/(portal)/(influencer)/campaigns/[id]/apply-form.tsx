"use client";

import { useActionState, useState } from "react";

import { IdentityRequired } from "@/components/identity/identity-required";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MAX_NOTE_LENGTH } from "@/lib/applications";
import {
  MIN_CPC_NAIRA,
  creatorReceivesKobo,
  maxClicks,
  type PaymentModel,
} from "@/lib/campaign";
import { formatNaira, KOBO_PER_NAIRA } from "@/lib/money";

import { applyAction, type ApplyState } from "./actions";

/**
 * Apply to a campaign, or (with `application`) change the price or rate and
 * note of an application that hasn't been decided yet. A fixed-price campaign
 * lets the creator propose a price; a pay-per-click campaign lets them propose
 * a price per click, since its budget is fixed.
 */
export function ApplyForm({
  campaignId,
  campaignPriceKobo,
  campaignCpcKobo = null,
  paymentModel = "fixed",
  application,
  identityRequired = false,
}: {
  campaignId: string;
  campaignPriceKobo: number;
  /** The campaign's price per click (per-click campaigns). */
  campaignCpcKobo?: number | null;
  paymentModel?: PaymentModel;
  application?: {
    id: string;
    proposedPriceKobo: number | null;
    proposedCpcKobo: number | null;
    note: string | null;
  };
  /** The creator has not confirmed their identity: show why instead of an Apply button. */
  identityRequired?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyAction,
    { status: "idle" },
  );
  const priceKobo = application?.proposedPriceKobo ?? campaignPriceKobo;
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  const startRateKobo = application?.proposedCpcKobo ?? campaignCpcKobo;
  const [rate, setRate] = useState(
    startRateKobo === null ? "" : String(startRateKobo / KOBO_PER_NAIRA),
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      {application && (
        <input type="hidden" name="applicationId" value={application.id} />
      )}
      {paymentModel === "per_click" ? (
        <TextField
          label="Your price per click (₦)"
          name="rate"
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          hint={rateHint(rate, campaignPriceKobo, campaignCpcKobo)}
          error={errors.rate}
          className="max-w-xs"
        />
      ) : (
        <TextField
          label="Your price (₦)"
          name="price"
          inputMode="numeric"
          defaultValue={
            values.price ?? (priceKobo / KOBO_PER_NAIRA).toLocaleString("en-NG")
          }
          hint={`The campaign pays ${formatNaira(campaignPriceKobo)} (you’d receive ${formatNaira(creatorReceivesKobo(campaignPriceKobo))} after our 5% fee). Change it to propose your own price; the business decides.`}
          error={errors.price}
          className="max-w-xs"
        />
      )}
      <TextAreaField
        label="Note to the business"
        name="note"
        optional
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        defaultValue={values.note ?? application?.note ?? ""}
        hint="Why you’re a good fit, or what you’d make. Keep phone numbers and emails out: you’ll talk on Pitchype."
        error={errors.note}
      />
      <FormMessage status={state.status} message={state.message} />
      {identityRequired ? (
        <IdentityRequired label="Apply to this campaign" size="lg" />
      ) : (
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? "Sending…"
            : application
              ? "Save changes"
              : "Apply to this campaign"}
        </Button>
      )}
    </form>
  );
}

/**
 * What the typed rate means for the creator: the most they can earn, how many
 * clicks that takes and what they keep after our fee. Says nothing until the
 * rate is one the database would accept.
 */
function rateHint(
  typed: string,
  budgetKobo: number,
  campaignCpcKobo: number | null,
): string {
  const base =
    campaignCpcKobo === null
      ? ""
      : `The campaign pays ${formatNaira(campaignCpcKobo)} a click, up to ${formatNaira(budgetKobo)}. `;
  const naira = Number(typed.replace(/[₦,\s]/g, ""));
  const kobo = naira * KOBO_PER_NAIRA;
  const valid =
    Number.isInteger(naira) &&
    naira >= MIN_CPC_NAIRA &&
    Number.isSafeInteger(kobo) &&
    budgetKobo % kobo === 0;
  if (!valid) {
    return `${base}Change it to propose your own price; the business decides. It has to be at least ${formatNaira(MIN_CPC_NAIRA * KOBO_PER_NAIRA)} and fit the budget in whole clicks.`;
  }
  return `${base}At ${formatNaira(kobo)} a click, ${maxClicks(budgetKobo, kobo).toLocaleString("en-NG")} clicks earn the full ${formatNaira(budgetKobo)}, and you’d keep ${formatNaira(creatorReceivesKobo(budgetKobo))} after our 5% fee. The business decides whether to hire you at it.`;
}
