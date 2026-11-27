import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ResendError, sendEmail, type EmailMessage } from "./resend.ts";

const KEY = "re_test_unit_key_0123456789";
const FROM = "Pitchype <hello@example.test>";
const ADDRESS = "creator@example.test";

const message: EmailMessage = {
  to: ADDRESS,
  subject: "Your hire was funded",
  html: "<p>Funded</p>",
  text: "Funded",
  idempotencyKey: "notification-123-attempt-1",
};

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
const realFetch = globalThis.fetch;
const realKey = process.env.RESEND_API_KEY;
const realFrom = process.env.FROM_EMAIL;

beforeEach(() => {
  calls = [];
  process.env.RESEND_API_KEY = KEY;
  process.env.FROM_EMAIL = FROM;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = realKey;
  if (realFrom === undefined) delete process.env.FROM_EMAIL;
  else process.env.FROM_EMAIL = realFrom;
});

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

async function rejection(promise: Promise<unknown>): Promise<ResendError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ResendError, "expected a ResendError");
    return error;
  }
  assert.fail("expected the call to throw");
}

test("posts to Resend with the key, sender and idempotency key", async () => {
  stubFetch(200, { id: "email_1" });
  await sendEmail(message);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${KEY}`);
  assert.equal(headers["Idempotency-Key"], message.idempotencyKey);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    from: FROM,
    to: [ADDRESS],
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
});

test("a reply-to address is passed on only when given", async () => {
  stubFetch(200, { id: "email_2" });
  await sendEmail({ ...message, replyTo: "ada@example.com" });
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).reply_to, [
    "ada@example.com",
  ]);
});

test("a non-2xx answer throws ResendError with the status", async () => {
  for (const status of [429, 500]) {
    stubFetch(status, { name: "error", message: "Try again later" });
    const error = await rejection(sendEmail(message));
    assert.equal(error.status, status);
  }
});

test("a network failure throws ResendError with status 0", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const error = await rejection(sendEmail(message));
  assert.equal(error.status, 0);
});

test("the error message never contains the key or the address", async () => {
  stubFetch(422, {
    name: "validation_error",
    message: `Bad address ${ADDRESS} for key ${KEY}`,
  });
  const error = await rejection(sendEmail(message));
  assert.equal(error.status, 422);
  assert.ok(!error.message.includes(KEY));
  assert.ok(!error.message.includes(ADDRESS));
});

test("a missing key or sender throws before calling fetch", async () => {
  stubFetch(200, { id: "email_1" });

  delete process.env.RESEND_API_KEY;
  const noKey = await rejection(sendEmail(message));
  assert.equal(noKey.status, 0);

  process.env.RESEND_API_KEY = KEY;
  delete process.env.FROM_EMAIL;
  const noFrom = await rejection(sendEmail(message));
  assert.equal(noFrom.status, 0);

  assert.equal(calls.length, 0);
});
