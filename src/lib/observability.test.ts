import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { reportServerError, scrub } from "./observability.ts";

const API_KEY = "phc_test_project_key_0123456789";
const RESEND_KEY = "re_test_resend_key_0123456789";
const ADDRESS = "creator@example.test";

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let respond: () => Promise<Response> = async () =>
  new Response("{}", { status: 200 });
const realFetch = globalThis.fetch;
const realEnv = {
  POSTHOG_PROJECT_API_KEY: process.env.POSTHOG_PROJECT_API_KEY,
  POSTHOG_HOST: process.env.POSTHOG_HOST,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

beforeEach(() => {
  calls = [];
  respond = async () => new Response("{}", { status: 200 });
  process.env.POSTHOG_PROJECT_API_KEY = API_KEY;
  delete process.env.POSTHOG_HOST;
  process.env.RESEND_API_KEY = RESEND_KEY;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return respond();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [name, value] of Object.entries(realEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("sends nothing when no project key is set", async () => {
  delete process.env.POSTHOG_PROJECT_API_KEY;
  await reportServerError(new Error("boom"), "GET /x");
  assert.equal(calls.length, 0);
});

test("sends one $exception event to the default US host, with no person profile", async () => {
  await reportServerError(new Error("boom"), "POST /api/webhooks/paystack");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://us.i.posthog.com/capture/");
  const body = calls[0].body;
  assert.equal(body.api_key, API_KEY);
  assert.equal(body.event, "$exception");
  assert.equal(body.distinct_id, "server");
  const properties = body.properties as Record<string, unknown>;
  assert.equal(properties.$process_person_profile, false);
  assert.equal(properties.$exception_type, "Error");
  assert.equal(properties.$exception_message, "boom");
  assert.equal(properties.where, "POST /api/webhooks/paystack");
});

test("honours POSTHOG_HOST and drops a trailing slash", async () => {
  process.env.POSTHOG_HOST = "https://eu.i.posthog.com/";
  await reportServerError(new Error("boom"), "GET /x");
  assert.equal(calls[0].url, "https://eu.i.posthog.com/capture/");
});

test("scrubs email addresses, long numbers and secret values from the message", () => {
  const text = `could not send to ${ADDRESS} with ${RESEND_KEY} for account 0123456789`;
  const cleaned = scrub(text);
  assert.ok(!cleaned.includes(ADDRESS));
  assert.ok(!cleaned.includes(RESEND_KEY));
  assert.ok(!cleaned.includes("0123456789"));
  assert.match(cleaned, /\[address\]/);
  assert.match(cleaned, /\[secret\]/);
  assert.match(cleaned, /\[number\]/);
});

test("the sent body never contains the address or the key", async () => {
  await reportServerError(
    new Error(`mail to ${ADDRESS} failed with ${RESEND_KEY}`),
    "send-emails",
  );
  const sent = JSON.stringify(calls[0].body);
  assert.ok(!sent.includes(ADDRESS));
  assert.ok(!sent.includes(RESEND_KEY));
});

test("reads plain objects, as Next.js passes them to onRequestError", async () => {
  await reportServerError(
    { name: "TypeError", message: "bad input" },
    "POST /login",
  );
  const properties = calls[0].body.properties as Record<string, unknown>;
  assert.equal(properties.$exception_type, "TypeError");
  assert.equal(properties.$exception_message, "bad input");
});

test("never throws when PostHog cannot be reached", async () => {
  respond = async () => {
    throw new Error("network down");
  };
  await assert.doesNotReject(reportServerError(new Error("boom"), "GET /x"));
});

test("never throws when PostHog refuses the report", async () => {
  respond = async () => new Response("nope", { status: 401 });
  await assert.doesNotReject(reportServerError(new Error("boom"), "GET /x"));
});
