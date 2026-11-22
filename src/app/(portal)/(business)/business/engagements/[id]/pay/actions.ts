"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  CrayError,
  createPermanentAccount,
  initializeCheckout,
} from "@/lib/cray";
import { cancelEngagement, getEngagementDetails } from "@/lib/db/applications";
import {
  completeDepositAccount,
  getDepositAccountReference,
  getMyDepositAccount,
  payFromWallet,
  startPayment,
} from "@/lib/db/money";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { text, type FormState } from "@/lib/form-data";
import { initializeTransaction, PaystackError } from "@/lib/paystack";
import { refusalText } from "@/lib/refusals";
import { SITE_URL } from "@/lib/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CancelHireState = FormState<never>;

/**
 * Ends a hire before payment. The database checks it's this business's and
 * still waiting for payment, and refuses while a payment started in the last
 * 30 minutes may still land; that refusal is shown, not swallowed. Nothing
 * was charged, so nothing is refunded.
 */
export async function cancelHireAction(
  _previous: CancelHireState,
  form: FormData,
): Promise<CancelHireState> {
  await requireRole("business");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  const result = await cancelEngagement(engagementId);
  // Refreshed either way: a refusal can mean the hire moved on (paid, say).
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  return { status: "success", message: "The hire is cancelled." };
}

export type PayState = FormState<never>;

const PROVIDER_UNREACHABLE =
  "We couldn’t reach our payment provider. Nothing was charged. Please try again.";
const TRANSFER_UNAVAILABLE =
  "Bank transfer isn’t available yet. Please pay by card.";

/**
 * Makes sure the business has its Pitchype transfer account. The account is
 * created once, lazily, the first time they choose bank transfer: we fix the
 * reference first, then ask Cray for the account, retrying once with the SAME
 * reference if Cray doesn't answer (it treats a reused reference as the same
 * request). No BVN is sent; if Cray refuses without one, the business is told
 * to pay by card and the refusal is logged for the owner. Returns whether the
 * account is ready.
 */
async function ensureTransferAccount(
  businessId: string,
  businessName: string,
  email: string,
): Promise<boolean> {
  if ((await getMyDepositAccount()) !== null) return true;

  const reference = await getDepositAccountReference(businessId);
  const request = {
    reference,
    accountName: `Pitchype – ${businessName}`,
    email,
  };
  try {
    let account;
    try {
      account = await createPermanentAccount(request);
    } catch (error) {
      if (!(error instanceof CrayError) || error.status !== 0) throw error;
      account = await createPermanentAccount(request);
    }
    await completeDepositAccount({ reference, ...account });
    return true;
  } catch (error) {
    if (!(error instanceof CrayError)) throw error;
    console.error("cray permanent account refused", error.status, error.code);
    return false;
  }
}

/**
 * Pays for a hire, by card or bank transfer. The amounts and the provider come
 * from the database (start_payment reads the price off the engagement and
 * stamps the active provider), never from the form; the fee notice is checked
 * here and again in the database. A wallet that covers the whole price pays
 * without the provider; otherwise a card payment goes to the provider's
 * checkout, and a bank transfer shows the business's Pitchype transfer account
 * (the deposit funds the hire when it arrives).
 */
export async function payAction(
  _previous: PayState,
  form: FormData,
): Promise<PayState> {
  const user = await requireRole("business");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("feeNoticeSeen") !== "on") {
    return { status: "error", message: refusalText("fee_notice_required") };
  }
  const method = text(form, "method") === "transfer" ? "transfer" : "card";

  const started = await startPayment(engagementId, true, method);
  if (!started.ok && started.reason === "wallet_covers_total") {
    const paid = await payFromWallet(engagementId, true);
    if (!paid.ok) {
      return { status: "error", message: refusalText(paid.reason) };
    }
    // Before redirect(), which throws. A card payment is funded later, by the
    // return page or the webhook, which send their own.
    sendEmailsAfterResponse();
    redirect(`/business/engagements/${engagementId}`);
  }
  if (!started.ok) {
    return { status: "error", message: refusalText(started.reason) };
  }

  const engagement = await getEngagementDetails(engagementId);
  const businessName = engagement?.business.name || "Business";

  if (started.value.method === "transfer") {
    const ready = await ensureTransferAccount(
      user.id,
      businessName,
      started.value.email,
    );
    if (!ready) return { status: "error", message: TRANSFER_UNAVAILABLE };
    redirect(`/business/engagements/${engagementId}/pay?transfer=1`);
  }

  let checkoutUrl: string;
  try {
    if (started.value.provider === "cray") {
      // We put the reference in the return URL ourselves rather than rely on
      // the provider to append one.
      ({ checkoutUrl } = await initializeCheckout({
        amountKobo: started.value.cardAmountKobo,
        reference: started.value.reference,
        email: started.value.email,
        name: businessName,
        callbackUrl: `${SITE_URL}/business/engagements/${engagementId}/pay/return?reference=${started.value.reference}`,
      }));
    } else {
      ({ authorizationUrl: checkoutUrl } = await initializeTransaction({
        email: started.value.email,
        amountKobo: started.value.cardAmountKobo,
        reference: started.value.reference,
        callbackUrl: `${SITE_URL}/business/engagements/${engagementId}/pay/return`,
      }));
    }
  } catch (error) {
    if (error instanceof PaystackError || error instanceof CrayError) {
      return { status: "error", message: PROVIDER_UNREACHABLE };
    }
    throw error;
  }
  // redirect() works by throwing, so it stays outside the try block.
  redirect(checkoutUrl);
}
