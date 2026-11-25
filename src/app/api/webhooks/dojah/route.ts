import { sendEmailsAfterResponse } from "@/lib/email-after";
import { handleDojahWebhook } from "@/lib/identity";

// Dojah posts the result of a hosted identity session here. All decisions live
// in handleDojahWebhook (src/lib/identity.ts); this only hands over the raw
// body, unparsed, and the x-dojah-signature header.

export async function POST(request: Request) {
  const rawBody = await request.text();
  const { status, body } = await handleDojahWebhook(
    rawBody,
    request.headers.get("x-dojah-signature"),
  );
  // Only a 200 can have written anything (and so queued a notification). An
  // invalid signature (401) or a retry request (5xx) changed nothing.
  if (status === 200) sendEmailsAfterResponse();
  return Response.json(body, { status });
}
