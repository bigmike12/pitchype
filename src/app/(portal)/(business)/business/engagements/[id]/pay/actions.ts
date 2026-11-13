"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { cancelEngagement } from "@/lib/db/applications";
import { payFromWallet, startPayment } from "@/lib/db/money";
import { text, type FormState } from "@/lib/form-data";
import { initializeTransaction, PaystackError } from "@/lib/paystack";
import { refusalText } from "@/lib/refusals";
import { SITE_URL } from "@/lib/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Ends a hire before payment. The database checks it's this business's and
// still waiting for payment; nothing was charged, so nothing is refunded.
export async function cancelHireAction(form: FormData): Promise<void> {
  await requireRole("business");
  await cancelEngagement(text(form, "engagementId"));
  refresh();
}

export type PayState = FormState<never>;

/**
 * Pays for a hire. The amounts come from the database (start_payment reads
 * them off the engagement), never from the form; the fee notice is checked
 * here and again in the database. A wallet that covers the whole price pays
 * without Paystack; otherwise the person goes to Paystack for the rest.
 */
export async function payAction(
  _previous: PayState,
  form: FormData,
): Promise<PayState> {
  await requireRole("business");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("feeNoticeSeen") !== "on") {
    return { status: "error", message: refusalText("fee_notice_required") };
  }

  const started = await startPayment(engagementId, true);
  if (!started.ok && started.reason === "wallet_covers_total") {
    const paid = await payFromWallet(engagementId, true);
    if (!paid.ok) {
      return { status: "error", message: refusalText(paid.reason) };
    }
    redirect(`/business/engagements/${engagementId}`);
  }
  if (!started.ok) {
    return { status: "error", message: refusalText(started.reason) };
  }

  let authorizationUrl: string;
  try {
    ({ authorizationUrl } = await initializeTransaction({
      email: started.value.email,
      amountKobo: started.value.cardAmountKobo,
      reference: started.value.reference,
      callbackUrl: `${SITE_URL}/business/engagements/${engagementId}/pay/return`,
    }));
  } catch (error) {
    if (error instanceof PaystackError) {
      return {
        status: "error",
        message:
          "We couldn’t reach our payment provider. Nothing was charged. Please try again.",
      };
    }
    throw error;
  }
  // redirect() works by throwing, so it stays outside the try block.
  redirect(authorizationUrl);
}
