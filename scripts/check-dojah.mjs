// Checks that an environment's Dojah setup is ready, without changing any data.
//
//   node --env-file=.env.local scripts/check-dojah.mjs [webhook-url]
//   e.g. node --env-file=.env.local scripts/check-dojah.mjs http://localhost:3030/api/webhooks/dojah
//        node --env-file=.env.production scripts/check-dojah.mjs https://pitchype.com/api/webhooks/dojah
//
// 1. Every DOJAH_* variable and IDENTITY_FINGERPRINT_KEY is set.
// 2. The keys authenticate (the subscription list answers) and the kyc_widget
//    webhook is subscribed in this key's environment, to webhook-url if given.
// 3. An unknown reference is a 404 from the verification lookup (the backstop
//    reads that as "no session").
// 4. Sandbox only (free there, paid on live): the CAC lookup returns a company
//    with directors in the fields lookupCacAdvanced reads.
// 5. With a webhook-url: an unsigned post is refused (401) and one signed with
//    DOJAH_WEBHOOK_SECRET is accepted (200). The signed event carries a
//    reference that is not ours, so the app ignores it and writes nothing.
//
// The widget ids cannot be checked by API: complete each flow once in the
// browser (see docs/TODO.md §14). Never prints a key.

import { createHmac } from "node:crypto";

const webhookUrl = process.argv[2];
const env = process.env;
let failed = 0;

function pass(message) {
  console.log(`  ok    ${message}`);
}
function fail(message) {
  failed += 1;
  console.log(`  FAIL  ${message}`);
}

console.log("Environment variables");
const names = [
  "DOJAH_BASE_URL",
  "DOJAH_APP_ID",
  "DOJAH_SECRET_KEY",
  "DOJAH_PUBLIC_KEY",
  "DOJAH_WEBHOOK_SECRET",
  "DOJAH_WIDGET_ID_NIN",
  "DOJAH_WIDGET_ID_BVN",
  "IDENTITY_FINGERPRINT_KEY",
];
for (const name of names) {
  if ((env[name] ?? "") === "") fail(`${name} is not set`);
  else pass(`${name} is set`);
}
if ((env.DOJAH_BASE_URL ?? "") === "" || (env.DOJAH_SECRET_KEY ?? "") === "") {
  console.log(
    "\nCannot call Dojah without DOJAH_BASE_URL and DOJAH_SECRET_KEY.",
  );
  process.exit(1);
}

const base = env.DOJAH_BASE_URL.replace(/\/+$/, "");
const sandbox = new URL(base).host.startsWith("sandbox.");
const environment = sandbox ? "sandbox" : "live";
console.log(`\nDojah API (${new URL(base).host}, ${environment})`);

async function get(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: env.DOJAH_SECRET_KEY, AppId: env.DOJAH_APP_ID },
    signal: AbortSignal.timeout(15_000),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

const subscriptions = await get("/api/v1/webhook/fetch");
if (subscriptions.status === 401 || subscriptions.status === 403) {
  fail(
    `the keys were refused (${subscriptions.status}); check DOJAH_APP_ID and DOJAH_SECRET_KEY`,
  );
} else {
  pass(`the keys authenticate (${subscriptions.status})`);
  // Dojah's docs show `entity` as the list; the API answers a page of it in
  // `entity.webhooks` (seen 2026-11-25). Accept either.
  const entity = subscriptions.json?.entity;
  const list = Array.isArray(entity)
    ? entity
    : Array.isArray(entity?.webhooks)
      ? entity.webhooks
      : [];
  const widget = list.find(
    (s) =>
      s.service === "kyc_widget" &&
      (s.environment ?? environment) === environment,
  );
  if (!widget) {
    fail(`no kyc_widget webhook subscribed in ${environment}`);
  } else if (webhookUrl && widget.endpoint !== webhookUrl) {
    fail(`kyc_widget is subscribed to ${widget.endpoint}, not ${webhookUrl}`);
  } else {
    pass(`kyc_widget is subscribed to ${widget.endpoint}`);
  }
}

const unknown = await get(
  `/api/v1/kyc/verification?reference_id=pit_id_${"0".repeat(32)}`,
);
if (unknown.status === 404) pass("an unknown reference is a 404");
else fail(`an unknown reference answered ${unknown.status}, expected 404`);

if (sandbox) {
  const cac = await get(
    "/api/v1/kyc/cac/advance?rc_number=1261103&company_type=COMPANY",
  );
  const entity = cac.json?.entity ?? {};
  const affiliates = Array.isArray(entity.affiliates) ? entity.affiliates : [];
  if (cac.status === 402) {
    fail("the CAC lookup answered 402: fund the Dojah wallet");
  } else if (
    cac.status === 200 &&
    typeof entity.company_name === "string" &&
    affiliates.length > 0 &&
    "first_name" in affiliates[0] &&
    "last_name" in affiliates[0]
  ) {
    pass("the CAC lookup returns a company and its directors");
  } else {
    fail(`the CAC lookup answered ${cac.status} without the expected fields`);
  }
} else {
  console.log("  skip  the CAC lookup (paid on live)");
}

if (webhookUrl) {
  console.log(`\nWebhook route (${webhookUrl})`);
  const body = JSON.stringify({
    reference_id: `check_dojah_${Date.now()}`,
    verification_status: "Completed",
    status: false,
  });
  // 60 seconds: `next dev` can take ~20 to compile the route on a first hit.
  // No answer is reported as status 0, a failed check.
  async function post(headers) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      return response.status;
    } catch {
      return 0;
    }
  }

  const unsigned = await post({});
  if (unsigned === 401) pass("an unsigned event is refused (401)");
  else fail(`an unsigned event answered ${unsigned}, expected 401`);

  if ((env.DOJAH_WEBHOOK_SECRET ?? "") !== "") {
    const signature = createHmac("sha256", env.DOJAH_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    const signed = await post({ "x-dojah-signature": signature });
    if (signed === 200) {
      pass(
        "a signed event is accepted (200); the app has the same webhook secret",
      );
    } else {
      fail(
        `a signed event answered ${signed}, expected 200` +
          (signed === 401
            ? ": the app's DOJAH_WEBHOOK_SECRET differs from this one"
            : ""),
      );
    }
  }
}

console.log(
  failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
