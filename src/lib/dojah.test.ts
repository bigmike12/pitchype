import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  DojahError,
  getVerification,
  isDojahConfigured,
  isValidDojahSignature,
  lookupCacAdvanced,
  screenBusiness,
  screenPerson,
  widgetConfig,
} from "./dojah.ts";

const ENV = {
  DOJAH_BASE_URL: "https://dojah.test",
  DOJAH_APP_ID: "app_test_1",
  DOJAH_SECRET_KEY: "sk_test_secret_value_0123456789",
  DOJAH_PUBLIC_KEY: "pk_test_public_value",
  DOJAH_WEBHOOK_SECRET: "whsec_test_value",
  DOJAH_WIDGET_ID_NIN: "widget_nin_1",
  IDENTITY_FINGERPRINT_KEY: "unused-here",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function stub(status: number, body: unknown) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  for (const [name, value] of Object.entries(ENV)) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const name of Object.keys(ENV)) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const CAC_SAMPLE = {
  entity: {
    company_name: "JOHN DOE LIMITED",
    rc_number: "1234567",
    address: "John doe street",
    email: "abc@gmail.com",
    type_of_company: "BUSINESS_NAME",
    status: "ACTIVE",
    affiliates: [
      {
        first_name: "JOHN",
        last_name: "MUSA",
        affiliate_type: "PROPRIETOR",
        phone_number: "+2348132464910",
      },
    ],
  },
};

test("calls carry the secret as-is, with no Bearer, and the app id", async () => {
  stub(200, CAC_SAMPLE);
  await lookupCacAdvanced("1234567", "BUSINESS_NAME");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, ENV.DOJAH_SECRET_KEY);
  assert.equal(headers.AppId, ENV.DOJAH_APP_ID);
});

test("the advanced CAC lookup parses the sample and keeps only what we need", async () => {
  stub(200, CAC_SAMPLE);
  const result = await lookupCacAdvanced("1234567", "BUSINESS_NAME");
  assert.equal(
    calls[0].url,
    "https://dojah.test/api/v1/kyc/cac/advance?rc_number=1234567&company_type=BUSINESS_NAME",
  );
  assert.deepEqual(result, {
    found: true,
    companyName: "JOHN DOE LIMITED",
    companyType: "BUSINESS_NAME",
    status: "ACTIVE",
    registrationNumber: "1234567",
    directors: ["JOHN MUSA"],
  });
});

test("a CAC lookup without a status text has a null status", async () => {
  const entity: Record<string, unknown> = { ...CAC_SAMPLE.entity };
  delete entity.status;
  stub(200, { entity });
  const result = await lookupCacAdvanced("1234567", "BUSINESS_NAME");
  assert.equal(result.found && result.status, null);
});

test("a CAC 404 means not found", async () => {
  stub(404, { error: "not found" });
  assert.deepEqual(await lookupCacAdvanced("1", "COMPANY"), { found: false });
});

test("an empty wallet and an upstream outage keep their status", async () => {
  for (const status of [402, 424]) {
    stub(status, { error: "nope" });
    await assert.rejects(
      () => lookupCacAdvanced("1", "COMPANY"),
      (error: unknown) =>
        error instanceof DojahError && error.status === status,
    );
  }
});

test("no answer at all is status 0", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  await assert.rejects(
    () => lookupCacAdvanced("1", "COMPANY"),
    (error: unknown) => error instanceof DojahError && error.status === 0,
  );
});

test("an error never carries the key or a long number", async () => {
  stub(400, { error: `bad value 22222222222 with ${ENV.DOJAH_SECRET_KEY}` });
  await assert.rejects(
    () => getVerification("DJ-1"),
    (error: unknown) =>
      error instanceof DojahError &&
      !error.message.includes("22222222222") &&
      !error.message.includes(ENV.DOJAH_SECRET_KEY),
  );
});

test("getVerification asks by reference and treats 404 as nothing", async () => {
  stub(200, { reference_id: "pit_id_x", verification_status: "Completed" });
  const found = await getVerification("pit_id_x");
  assert.equal(
    calls[0].url,
    "https://dojah.test/api/v1/kyc/verification?reference_id=pit_id_x",
  );
  assert.deepEqual(found, {
    reference_id: "pit_id_x",
    verification_status: "Completed",
  });
  stub(404, {});
  assert.equal(await getVerification("pit_id_y"), null);
});

test("getVerification unwraps Dojah's entity so the answer has the webhook's shape", async () => {
  // Seen in sandbox 2026-11-25: the lookup wraps the session in `entity`; the
  // webhook does not. Left wrapped, the daily backstop failed passing sessions.
  stub(200, {
    entity: { reference_id: "pit_id_x", verification_status: "Completed" },
  });
  assert.deepEqual(await getVerification("pit_id_x"), {
    reference_id: "pit_id_x",
    verification_status: "Completed",
  });
});

test("screening a person sends the exact body and counts the results", async () => {
  stub(200, {
    entity: { results: [{ source_type: "PEP" }, { source_type: "PEP" }] },
  });
  const result = await screenPerson({
    name: "CHIDI OKAFOR",
    dateOfBirth: "1992-10-09",
    reference: "pit_sc_1",
  });
  assert.equal(calls[0].url, "https://dojah.test/api/v2/aml/screening");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    schema: "individual",
    unique_reference: "pit_sc_1",
    properties: {
      names: "CHIDI OKAFOR",
      date_of_birth: "09-10-1992",
      nationality: "Nigerian",
      id_number: "",
    },
    screening_options: {
      pep_check: true,
      sanction: true,
      adverse_media_check: false,
    },
  });
  assert.equal(result.matchCount, 2);
});

test("screening a business uses the organization schema; no results is zero", async () => {
  stub(200, { entity: { results: [] } });
  const result = await screenBusiness({
    name: "ACME LIMITED",
    reference: "r1",
  });
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.schema, "organization");
  assert.equal(body.properties.names, "ACME LIMITED");
  assert.equal(result.matchCount, 0);
});

test("screening a person without a date of birth leaves it out", async () => {
  stub(200, { entity: {} });
  await screenPerson({ name: "A B", dateOfBirth: null, reference: "r" });
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal("date_of_birth" in body.properties, false);
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

test("a webhook signature is checked against the raw body", () => {
  const body = '{"reference_id":"pit_id_1"}';
  const good = sign(body, ENV.DOJAH_WEBHOOK_SECRET);
  assert.equal(isValidDojahSignature(body, good), true);
  assert.equal(isValidDojahSignature(body + " ", good), false);
  assert.equal(isValidDojahSignature(body, sign(body, "other")), false);
  assert.equal(isValidDojahSignature(body, null), false);
  assert.equal(isValidDojahSignature(body, good.slice(0, 10)), false);
});

test("no webhook secret means nothing is valid", () => {
  delete process.env.DOJAH_WEBHOOK_SECRET;
  assert.equal(isValidDojahSignature("{}", sign("{}", "")), false);
});

test("isDojahConfigured needs all seven variables", () => {
  assert.equal(isDojahConfigured(), true);
  delete process.env.DOJAH_WIDGET_ID_NIN;
  assert.equal(isDojahConfigured(), false);
});

test("widgetConfig hands the browser only the public values", () => {
  assert.deepEqual(widgetConfig(), {
    appId: ENV.DOJAH_APP_ID,
    publicKey: ENV.DOJAH_PUBLIC_KEY,
    widgetId: ENV.DOJAH_WIDGET_ID_NIN,
  });
});
