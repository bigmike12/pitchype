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
  return Response.json(body, { status });
}
