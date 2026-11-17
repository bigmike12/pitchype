// Sends a signed fake Paystack webhook to a local server, for checking the
// webhook route by hand. Development only.
//
//   node --env-file=.env.local scripts/sign-webhook.mjs <event> <reference> [url]
//   e.g. node --env-file=.env.local scripts/sign-webhook.mjs charge.success pit_doesnotexist
//
// The handler verifies every reference with Paystack itself, so this cannot
// fund anything Paystack doesn't know about. The secret key is never printed.

import { createHmac } from "node:crypto";

const [event, reference, url = "http://localhost:3030/api/webhooks/paystack"] =
  process.argv.slice(2);

if (!event || !reference) {
  console.error(
    "Usage: node --env-file=.env.local scripts/sign-webhook.mjs <event> <reference> [url]",
  );
  process.exit(1);
}

const key = process.env.PAYSTACK_SECRET_KEY;
if (!key) {
  console.error("PAYSTACK_SECRET_KEY is not set (pass --env-file=.env.local).");
  process.exit(1);
}

const body = JSON.stringify({ event, data: { reference } });
const signature = createHmac("sha512", key).update(body).digest("hex");

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-paystack-signature": signature,
  },
  body,
});
console.log(response.status, await response.text());
