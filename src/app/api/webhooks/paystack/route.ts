import { sendEmailsAfterResponse } from "@/lib/email-after";
import { handlePaystackWebhook } from "@/lib/payments";

// Paystack posts charge and transfer events here. All decisions live in
// handlePaystackWebhook (src/lib/payments.ts); this only hands over the raw
// body, unparsed, so the signature is checked on exactly what was sent.

export async function POST(request: Request) {
  const rawBody = await request.text();
  const { status, body } = await handlePaystackWebhook(
    rawBody,
    request.headers.get("x-paystack-signature"),
  );
  // Only a 200 can have written anything. An invalid signature (401) or a
  // retry request (5xx) changed nothing, so those don't start a send run. The
  // response itself is never touched by the email.
  if (status === 200) sendEmailsAfterResponse();
  return Response.json(body, { status });
}
