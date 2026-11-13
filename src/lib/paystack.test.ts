import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  PaystackError,
  createTransferRecipient,
  getBalanceKobo,
  initializeTransaction,
  initiateTransfer,
  isValidSignature,
  listBanks,
  resolveAccount,
  verifyTransaction,
  verifyTransfer,
} from "./paystack.ts";

const SECRET = "sk_test_unit_secret_0123456789abcdef";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
const realFetch = globalThis.fetch;
const realSecret = process.env.PAYSTACK_SECRET_KEY;

beforeEach(() => {
  calls = [];
  process.env.PAYSTACK_SECRET_KEY = SECRET;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = realSecret;
});

/** Answers each fetch with the next response in the list (the last repeats). */
function stubFetch(...responses: { status?: number; body: unknown }[]) {
  let index = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const text =
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body);
    return new Response(text, { status: response.status ?? 200 });
  }) as typeof fetch;
}

function stubFetchThrowing(error: Error) {
  globalThis.fetch = (async () => {
    throw error;
  }) as typeof fetch;
}

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return { body: { status: true, message: "ok", data, ...extra } };
}

async function rejection(promise: Promise<unknown>): Promise<PaystackError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PaystackError, "expected a PaystackError");
    return error;
  }
  assert.fail("expected the call to throw");
}

// Shaped like Paystack's documented GET /transaction/verify response.
const verifyFixture = {
  id: 4099260516,
  domain: "test",
  status: "success",
  reference: "re4lyvq3s3",
  amount: 4050000,
  message: null,
  gateway_response: "Successful",
  paid_at: "2024-08-22T09:15:02.000Z",
  channel: "card",
  currency: "NGN",
  fees: 10050,
  customer: { id: 181873746, email: "demo@test.com" },
};

// --- isValidSignature -------------------------------------------------------

function sign(body: string, secret = SECRET) {
  return createHmac("sha512", secret).update(body).digest("hex");
}

test("signature: accepts a body signed with the secret key", () => {
  const body = '{"event":"charge.success","data":{"reference":"abc"}}';
  assert.equal(isValidSignature(body, sign(body)), true);
});

test("signature: rejects a modified body", () => {
  const body = '{"event":"charge.success"}';
  assert.equal(isValidSignature(body + " ", sign(body)), false);
});

test("signature: rejects a signature made with another key", () => {
  const body = '{"event":"charge.success"}';
  assert.equal(isValidSignature(body, sign(body, "sk_test_other")), false);
});

test("signature: rejects a missing, short or long signature without throwing", () => {
  const body = '{"event":"charge.success"}';
  const good = sign(body);
  assert.equal(isValidSignature(body, null), false);
  assert.equal(isValidSignature(body, ""), false);
  assert.equal(isValidSignature(body, good.slice(0, 20)), false);
  assert.equal(isValidSignature(body, good + "00"), false);
});

test("signature: rejects everything when the secret key is missing or empty", () => {
  const body = "{}";
  const signature = sign(body);
  delete process.env.PAYSTACK_SECRET_KEY;
  assert.equal(isValidSignature(body, signature), false);
  process.env.PAYSTACK_SECRET_KEY = "";
  assert.equal(isValidSignature(body, sign(body, "")), false);
});

// --- verifyTransaction ------------------------------------------------------

test("verifyTransaction maps a successful payment and sends the right request", async () => {
  stubFetch(ok(verifyFixture));
  const result = await verifyTransaction("re4lyvq3s3");
  assert.equal(result.status, "success");
  assert.equal(result.amountKobo, 4050000);
  assert.equal(result.feesKobo, 10050);
  assert.equal(result.currency, "NGN");
  assert.equal((result.raw as { id: number }).id, 4099260516);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://api.paystack.co/transaction/verify/re4lyvq3s3",
  );
  assert.equal(calls[0].init.method, "GET");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${SECRET}`);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, undefined);
  assert.ok(calls[0].init.signal, "a timeout signal is attached");
});

test("verifyTransaction maps failed and abandoned", async () => {
  stubFetch(ok({ ...verifyFixture, status: "failed" }));
  assert.equal((await verifyTransaction("re4lyvq3s3")).status, "failed");
  stubFetch(ok({ ...verifyFixture, status: "abandoned" }));
  assert.equal((await verifyTransaction("re4lyvq3s3")).status, "abandoned");
});

test("verifyTransaction treats every other status as pending", async () => {
  for (const status of ["ongoing", "pending", "processing", "queued", "reversed"]) {
    stubFetch(ok({ ...verifyFixture, status }));
    assert.equal((await verifyTransaction("re4lyvq3s3")).status, "pending", status);
  }
});

test("verifyTransaction refuses a successful payment with no fee figure", async () => {
  for (const fees of [null, undefined, "10050"]) {
    stubFetch(ok({ ...verifyFixture, fees }));
    const error = await rejection(verifyTransaction("re4lyvq3s3"));
    assert.equal(error.status, 0);
    assert.equal(
      error.message,
      "Paystack did not return the fee for a successful payment",
    );
  }
});

test("verifyTransaction refuses amounts that are not whole positive kobo", async () => {
  for (const amount of [100.5, -4050000, 0, "4050000", null]) {
    stubFetch(ok({ ...verifyFixture, amount }));
    const error = await rejection(verifyTransaction("re4lyvq3s3"));
    assert.equal(error.status, 0);
  }
});

test("verifyTransaction treats a fractional or negative fee as missing", async () => {
  for (const fees of [10.5, -1]) {
    stubFetch(ok({ ...verifyFixture, fees }));
    const error = await rejection(verifyTransaction("re4lyvq3s3"));
    assert.equal(
      error.message,
      "Paystack did not return the fee for a successful payment",
    );
    stubFetch(ok({ ...verifyFixture, status: "failed", fees }));
    assert.equal((await verifyTransaction("re4lyvq3s3")).feesKobo, 0);
  }
});

test("verifyTransaction refuses an answer for a different reference", async () => {
  stubFetch(ok({ ...verifyFixture, reference: "someone_else" }));
  const error = await rejection(verifyTransaction("re4lyvq3s3"));
  assert.equal(error.status, 0);
  assert.ok(!error.message.includes(SECRET));
  // A missing reference in the answer is not a mismatch.
  stubFetch(ok({ ...verifyFixture, reference: undefined }));
  assert.equal((await verifyTransaction("re4lyvq3s3")).status, "success");
});

test("verifyTransaction returns a zero fee for a non-success status without one", async () => {
  stubFetch(ok({ ...verifyFixture, status: "abandoned", fees: null }));
  const result = await verifyTransaction("re4lyvq3s3");
  assert.equal(result.status, "abandoned");
  assert.equal(result.feesKobo, 0);
});

test("verifyTransaction URL-encodes the reference and rejects bad ones before fetching", async () => {
  stubFetch(ok({ ...verifyFixture, reference: "a.b-c_d=" }));
  await verifyTransaction("a.b-c_d=");
  assert.equal(
    calls[0].url,
    "https://api.paystack.co/transaction/verify/a.b-c_d%3D",
  );

  calls = [];
  for (const reference of [".", "..", "...", "", "   ", "a/b", "a b", "x".repeat(101), "a?b=1"]) {
    const error = await rejection(verifyTransaction(reference));
    assert.equal(error.status, 0);
  }
  assert.equal(calls.length, 0);
});

// --- initializeTransaction --------------------------------------------------

test("initializeTransaction sends kobo and NGN and returns the checkout url", async () => {
  stubFetch(
    ok({
      authorization_url: "https://checkout.paystack.com/abc",
      access_code: "abc",
      reference: "ref_1",
    }),
  );
  const result = await initializeTransaction({
    email: "biz@example.com",
    amountKobo: 5250000,
    reference: "ref_1",
    callbackUrl: "https://pitchype.test/pay/done",
  });
  assert.deepEqual(result, {
    authorizationUrl: "https://checkout.paystack.com/abc",
  });
  assert.equal(calls[0].url, "https://api.paystack.co/transaction/initialize");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    email: "biz@example.com",
    amount: 5250000,
    reference: "ref_1",
    callback_url: "https://pitchype.test/pay/done",
    currency: "NGN",
  });
});

test("initializeTransaction rejects non-integer, zero and negative amounts before fetching", async () => {
  stubFetch(ok({}));
  for (const amountKobo of [0, -100, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const error = await rejection(
      initializeTransaction({
        email: "biz@example.com",
        amountKobo,
        reference: "ref_1",
        callbackUrl: "https://pitchype.test/pay/done",
      }),
    );
    assert.equal(error.status, 0);
  }
  assert.equal(calls.length, 0);
});

// --- bank accounts ----------------------------------------------------------

test("resolveAccount rejects a bad account number or bank code without fetching", async () => {
  stubFetch(ok({}));
  for (const [number, bank] of [
    ["012345678", "058"],
    ["01234567890", "058"],
    ["012345678a", "058"],
    ["0123456789", ""],
    ["0123456789", "12"],
    ["0123456789", "0581234"],
    ["0123456789", "05 8"],
  ]) {
    const error = await rejection(resolveAccount(number, bank));
    assert.equal(error.status, 0);
    assert.equal(error.message, "invalid_account");
  }
  assert.equal(calls.length, 0);
});

test("resolveAccount returns the account name", async () => {
  stubFetch(ok({ account_number: "0123456789", account_name: "ADA OBI" }));
  const result = await resolveAccount("0123456789", "058");
  assert.deepEqual(result, { accountName: "ADA OBI" });
  assert.equal(
    calls[0].url,
    "https://api.paystack.co/bank/resolve?account_number=0123456789&bank_code=058",
  );
});

test("createTransferRecipient sends a nuban recipient and returns the code", async () => {
  stubFetch(ok({ recipient_code: "RCP_abc123" }));
  const result = await createTransferRecipient({
    name: "ADA OBI",
    accountNumber: "0123456789",
    bankCode: "058",
  });
  assert.deepEqual(result, { recipientCode: "RCP_abc123" });
  assert.equal(calls[0].url, "https://api.paystack.co/transferrecipient");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    type: "nuban",
    name: "ADA OBI",
    account_number: "0123456789",
    bank_code: "058",
    currency: "NGN",
  });
});

test("listBanks returns code and name and follows the next cursor", async () => {
  stubFetch(
    ok(
      [
        { name: "Access Bank", code: "044", slug: "access-bank" },
        { name: "GTBank", code: "058", slug: "gtbank" },
      ],
      { meta: { next: "cursor_2", perPage: 2 } },
    ),
    ok([{ name: "Zenith Bank", code: "057" }], { meta: { next: null } }),
  );
  const banks = await listBanks();
  assert.deepEqual(banks, [
    { code: "044", name: "Access Bank" },
    { code: "058", name: "GTBank" },
    { code: "057", name: "Zenith Bank" },
  ]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/api\.paystack\.co\/bank\?/);
  assert.match(calls[0].url, /country=nigeria/);
  assert.match(calls[0].url, /currency=NGN/);
  assert.match(calls[0].url, /perPage=100/);
  assert.doesNotMatch(calls[0].url, /next=/);
  assert.match(calls[1].url, /next=cursor_2/);
});

test("listBanks keeps one entry per code", async () => {
  stubFetch(
    ok([
      { name: "First", code: "044" },
      { name: "Second", code: "044" },
    ]),
  );
  assert.deepEqual(await listBanks(), [{ code: "044", name: "First" }]);
});

test("listBanks stops after five pages", async () => {
  stubFetch(ok([{ name: "A", code: "001" }], { meta: { next: "more" } }));
  await listBanks();
  assert.equal(calls.length, 5);
});

// --- transfers --------------------------------------------------------------

test("initiateTransfer sends kobo from the balance", async () => {
  stubFetch(ok({ transfer_code: "TRF_abc", status: "otp" }));
  const result = await initiateTransfer({
    amountKobo: 4750000,
    recipientCode: "RCP_abc123",
    reference: "payout_1",
    reason: "Pitchype payout",
  });
  assert.deepEqual(result, { transferCode: "TRF_abc" });
  assert.equal(calls[0].url, "https://api.paystack.co/transfer");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    source: "balance",
    amount: 4750000,
    recipient: "RCP_abc123",
    reference: "payout_1",
    reason: "Pitchype payout",
  });
});

test("initiateTransfer rejects a bad amount or reference before fetching", async () => {
  stubFetch(ok({}));
  await rejection(
    initiateTransfer({
      amountKobo: 1000.5,
      recipientCode: "RCP_x",
      reference: "payout_1",
      reason: "r",
    }),
  );
  await rejection(
    initiateTransfer({
      amountKobo: 1000,
      recipientCode: "RCP_x",
      reference: "bad ref",
      reason: "r",
    }),
  );
  assert.equal(calls.length, 0);
});

test("verifyTransfer maps each Paystack status", async () => {
  const expected: [string, string][] = [
    ["success", "success"],
    ["failed", "failed"],
    ["reversed", "reversed"],
    ["otp", "pending"],
    ["pending", "pending"],
    ["processing", "pending"],
    ["received", "pending"],
    ["queued", "pending"],
  ];
  for (const [paystack, ours] of expected) {
    stubFetch(ok({ status: paystack, reference: "payout_1" }));
    const result = await verifyTransfer("payout_1");
    assert.equal(result.status, ours, paystack);
    assert.equal((result.raw as { status: string }).status, paystack);
  }
  assert.equal(calls[0].url, "https://api.paystack.co/transfer/verify/payout_1");
});

test("verifyTransfer treats a 404 as not_found, not an error", async () => {
  stubFetch({
    status: 404,
    body: { status: false, message: "Transfer not found" },
  });
  const result = await verifyTransfer("payout_1");
  assert.equal(result.status, "not_found");
});

test("verifyTransfer does not read a 5xx saying 'not found' as never created", async () => {
  for (const status of [500, 502, 503]) {
    stubFetch({
      status,
      body: { status: false, message: "Transfer not found" },
    });
    const error = await rejection(verifyTransfer("payout_1"));
    assert.equal(error.status, status);
  }
});

test("verifyTransfer treats a 400 saying 'Transfer not found' as not_found", async () => {
  stubFetch({
    status: 400,
    body: { status: false, message: "Transfer not found" },
  });
  assert.equal((await verifyTransfer("payout_1")).status, "not_found");
});

test("verifyTransfer still throws on other failures", async () => {
  stubFetch({ status: 500, body: { status: false, message: "Server error" } });
  const error = await rejection(verifyTransfer("payout_1"));
  assert.equal(error.status, 500);
});

// --- balance ----------------------------------------------------------------

test("getBalanceKobo picks the NGN entry", async () => {
  stubFetch(
    ok([
      { currency: "GHS", balance: 999 },
      { currency: "NGN", balance: 12345600 },
    ]),
  );
  assert.equal(await getBalanceKobo(), 12345600);
  assert.equal(calls[0].url, "https://api.paystack.co/balance");
});

test("getBalanceKobo ignores a fractional or negative NGN balance", async () => {
  for (const balance of [10.5, -1, "5"]) {
    stubFetch(ok([{ currency: "NGN", balance }]));
    await rejection(getBalanceKobo());
  }
});

test("getBalanceKobo throws when there is no NGN entry", async () => {
  stubFetch(ok([{ currency: "GHS", balance: 5 }]));
  await rejection(getBalanceKobo());
  stubFetch(ok([]));
  await rejection(getBalanceKobo());
});

// --- errors -----------------------------------------------------------------

test("errors carry the HTTP status and Paystack's message", async () => {
  stubFetch({
    status: 400,
    body: { status: false, message: "Invalid transaction reference" },
  });
  const error = await rejection(verifyTransaction("re4lyvq3s3"));
  assert.equal(error.status, 400);
  assert.equal(error.message, "Invalid transaction reference");
});

test("a status:false answer on HTTP 200 is an error", async () => {
  stubFetch({ body: { status: false, message: "Something went wrong" } });
  const error = await rejection(getBalanceKobo());
  assert.equal(error.message, "Something went wrong");
});

test("an unreadable or empty error body gives a generic message", async () => {
  stubFetch({ status: 502, body: "<html>Bad gateway</html>" });
  const error = await rejection(getBalanceKobo());
  assert.equal(error.status, 502);
  assert.ok(error.message.length > 0);
  stubFetch({ status: 200, body: "not json" });
  const unreadable = await rejection(getBalanceKobo());
  assert.ok(unreadable.message.length > 0);
});

test("error messages never contain the secret key or a full account number", async () => {
  stubFetch({
    status: 422,
    body: {
      status: false,
      message: `Could not resolve 0123456789 using ${SECRET} (Bearer ${SECRET})`,
    },
  });
  const error = await rejection(resolveAccount("0123456789", "058"));
  assert.equal(error.status, 422);
  assert.ok(!error.message.includes(SECRET), "secret key leaked");
  assert.ok(!error.message.includes("0123456789"), "account number leaked");
  assert.ok(error.message.includes("6789"), "last four digits kept");
});

test("a network failure or timeout becomes a status 0 PaystackError", async () => {
  stubFetchThrowing(new TypeError("fetch failed"));
  const network = await rejection(getBalanceKobo());
  assert.equal(network.status, 0);

  stubFetchThrowing(
    new DOMException("The operation was aborted due to timeout", "TimeoutError"),
  );
  const timeout = await rejection(getBalanceKobo());
  assert.equal(timeout.status, 0);
});

test("a network error that mentions the account number or key is not repeated", async () => {
  stubFetchThrowing(
    new TypeError(`fetch failed for ?account_number=0123456789 key ${SECRET}`),
  );
  const error = await rejection(resolveAccount("0123456789", "058"));
  assert.equal(error.status, 0);
  assert.ok(!error.message.includes(SECRET));
  assert.ok(!error.message.includes("0123456789"));
});

test("a body read that fails mid-way is status 0, not an unreadable answer", async () => {
  globalThis.fetch = (async () => {
    const failing = new ReadableStream({
      pull() {
        throw new TypeError("terminated");
      },
    });
    return new Response(failing, { status: 200 });
  }) as typeof fetch;
  const error = await rejection(
    initiateTransfer({
      amountKobo: 1000,
      recipientCode: "RCP_x",
      reference: "payout_1",
      reason: "r",
    }),
  );
  assert.equal(error.status, 0);
});

test("a missing secret key is a clear error and nothing is sent", async () => {
  stubFetch(ok([]));
  delete process.env.PAYSTACK_SECRET_KEY;
  const error = await rejection(getBalanceKobo());
  assert.equal(error.message, "PAYSTACK_SECRET_KEY is not set");
  assert.equal(calls.length, 0);
});
