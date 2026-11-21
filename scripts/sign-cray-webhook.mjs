// Builds a signed fake Cray webhook for checking the webhook route by hand.
// Development only.
//
//   node --env-file=.env.local scripts/sign-cray-webhook.mjs <event> <data.json> [url]
//   e.g. node --env-file=.env.local scripts/sign-cray-webhook.mjs collection.virtualaccount.successful deposit.json
//
// Prints the body and the Cray-Webhook-Key header value (the last four
// characters of the first key in CRAY_WEBHOOK_KEYS). With a url it also posts
// them, e.g. http://localhost:3030/api/webhooks/cray. The hash is
// base64(HMAC-SHA256(JSON.stringify(data), key)); only a collection.* event is
// signed by Cray. The key is never printed.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const [event, dataFile, url] = process.argv.slice(2);

if (!event || !dataFile) {
  console.error(
    "Usage: node --env-file=.env.local scripts/sign-cray-webhook.mjs <event> <data.json> [url]",
  );
  process.exit(1);
}

const key = (process.env.CRAY_WEBHOOK_KEYS ?? "").split(",")[0].trim();
if (!key) {
  console.error("CRAY_WEBHOOK_KEYS is not set (pass --env-file=.env.local).");
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataFile, "utf8"));
const hash = createHmac("sha256", key)
  .update(JSON.stringify(data))
  .digest("base64");
const body = JSON.stringify({ event, data, hash });
const keyHint = key.slice(-4);

console.log(body);
console.log(`Cray-Webhook-Key: ${keyHint}`);

if (url) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cray-Webhook-Key": keyHint,
    },
    body,
  });
  console.log(response.status, await response.text());
}
