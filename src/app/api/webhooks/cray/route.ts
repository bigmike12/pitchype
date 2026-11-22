import { sendEmailsAfterResponse } from "@/lib/email-after";
import { handleCrayWebhook } from "@/lib/payments";

// Cray posts bank-transfer deposits, checkout results and payout results
// here. All decisions live in handleCrayWebhook (src/lib/payments.ts); this
// only hands over the raw body, unparsed, and the key hint from the
// Cray-Webhook-Key header.

export async function POST(request: Request) {
  const rawBody = await request.text();
  const { status, body } = await handleCrayWebhook(
    rawBody,
    request.headers.get("cray-webhook-key"),
  );
  // Only a 200 can have written anything. An invalid signature (401) or a
  // retry request (5xx) changed nothing, so those don't start a send run. The
  // response itself is never touched by the email.
  if (status === 200) sendEmailsAfterResponse();
  return Response.json(body, { status });
}
