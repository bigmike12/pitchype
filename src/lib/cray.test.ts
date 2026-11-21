import assert from "node:assert/strict";
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  CrayError,
  __request,
  canonicalPathWithQuery,
  createPermanentAccount,
  disburse,
  getBalances,
  getMainBalanceKobo,
  initializeCheckout,
  isCrayConfigured,
  isValidWebhookHash,
  listBanks,
  queryCheckout,
  requeryPayout,
  validateAccount,
  koboToNaira,
  nairaToKobo,
  signatureHeader,
} from "./cray.ts";

const COLLECTION_KEY = "ck_test_collection_0123456789abcdef";
const DISBURSEMENT_KEY = "dk_test_disbursement_0123456789abcdef";
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const PRIVATE_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const ENV_NAMES = [
  "CRAY_BASE_URL",
  "CRAY_COLLECTION_API_KEY",
  "CRAY_DISBURSEMENT_API_KEY",
  "CRAY_WEBHOOK_KEYS",
  "CRAY_SIGNING_PRIVATE_KEY",
  "CRAY_SIGNING_KEY_ID",
  "CRAY_SUBACCOUNT_TOKEN",
] as const;
const savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  for (const name of ENV_NAMES) savedEnv[name] = process.env[name];
  process.env.CRAY_BASE_URL = "https://cray.test";
  process.env.CRAY_COLLECTION_API_KEY = COLLECTION_KEY;
  process.env.CRAY_DISBURSEMENT_API_KEY = DISBURSEMENT_KEY;
  process.env.CRAY_WEBHOOK_KEYS = "whk_test_abcd";
  process.env.CRAY_SIGNING_PRIVATE_KEY = PRIVATE_PEM;
  process.env.CRAY_SIGNING_KEY_ID = "kid_test_1";
  process.env.CRAY_SUBACCOUNT_TOKEN = "sub_test_token";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

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

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

// ---- naira and kobo ----

test("koboToNaira writes two decimals as a string", () => {
  assert.equal(koboToNaira(5_250_000), "52500.00");
  assert.equal(koboToNaira(5), "0.05");
  assert.equal(koboToNaira(100), "1.00");
});

test("koboToNaira refuses zero, negatives and fractions", () => {
  assert.throws(() => koboToNaira(0), CrayError);
  assert.throws(() => koboToNaira(-1), CrayError);
  assert.throws(() => koboToNaira(1.5), CrayError);
  assert.throws(() => koboToNaira(Number.NaN), CrayError);
});

test("nairaToKobo reads exact decimal text and JSON numbers", () => {
  assert.equal(nairaToKobo("3950.00000000"), 395_000);
  assert.equal(nairaToKobo("1000.00"), 100_000);
  assert.equal(nairaToKobo("5000"), 500_000);
  assert.equal(nairaToKobo(0.95), 95);
  assert.equal(nairaToKobo(0.05), 5);
  assert.equal(nairaToKobo(1), 100);
  assert.equal(nairaToKobo("52500.5"), 5_250_050);
});

test("nairaToKobo throws rather than rounding or guessing", () => {
  for (const bad of [
    "39.505",
    "-1",
    "abc",
    "",
    Number.NaN,
    1e21,
    "1,000",
    "1e3",
    "0.001",
  ]) {
    assert.throws(() => nairaToKobo(bad), CrayError, String(bad));
  }
});

// ---- canonical path ----

test("canonicalPathWithQuery sorts the query and trims a trailing slash", () => {
  assert.equal(
    canonicalPathWithQuery("/subaccounts/x/ledger?page=2&currency=NGN"),
    "/subaccounts/x/ledger?currency=NGN&page=2",
  );
  assert.equal(canonicalPathWithQuery("/balance/"), "/balance");
  assert.equal(canonicalPathWithQuery("/"), "/");
  assert.equal(
    canonicalPathWithQuery("/balance?search=S%C3%A3o%20Paulo&currency=NGN"),
    "/balance?currency=NGN&search=S%C3%A3o%20Paulo",
  );
});

test("canonicalPathWithQuery signs a plus as %2B", () => {
  assert.equal(canonicalPathWithQuery("/balance?q=a+b"), "/balance?q=a%2Bb");
});

// ---- signature ----

test("signatureHeader signs the canonical string with ES256 (docs example)", () => {
  const body = '{"amount":1000,"currency":"NGN"}';
  const header = signatureHeader({
    method: "POST",
    pathWithQuery: "/virtual-accounts/create",
    body,
    privateKeyPem: PRIVATE_PEM,
    keyId: "kid_test_1",
    timestampMs: 1761132000000,
    nonce: "1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
  });
  assert.match(
    header,
    /^t=1761132000000,n=1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8,kid=[^,]+,v1=[A-Za-z0-9+/=]+$/,
  );
  assert.equal(
    createHash("sha256").update(body).digest("hex"),
    "6469249697a442b13fd6384708be6aede58b356f534aee1549b252ef370a3e36",
  );
  const canonical =
    "POST\n/virtual-accounts/create\n1761132000000\n1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8\n6469249697a442b13fd6384708be6aede58b356f534aee1549b252ef370a3e36";
  const signature = Buffer.from(header.split("v1=")[1], "base64");
  assert.equal(
    verify(
      "sha256",
      Buffer.from(canonical),
      { key: publicKey, dsaEncoding: "der" },
      signature,
    ),
    true,
  );
});

test("signatureHeader hashes an empty body for a GET", () => {
  const header = signatureHeader({
    method: "GET",
    pathWithQuery: "/balance?currency=NGN",
    body: "",
    privateKeyPem: PRIVATE_PEM,
    keyId: "kid_test_1",
    timestampMs: 1761132000000,
    nonce: "n-1",
  });
  const canonical =
    "GET\n/balance?currency=NGN\n1761132000000\nn-1\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const signature = Buffer.from(header.split("v1=")[1], "base64");
  assert.equal(
    verify(
      "sha256",
      Buffer.from(canonical),
      { key: publicKey, dsaEncoding: "der" },
      signature,
    ),
    true,
  );
});

// ---- request ----

const OK_BODY = { status: true, message: "ok", data: { id: "x" } };

test("request uses the key of the scope and signs the exact body it sends", async () => {
  stubFetch({ body: OK_BODY }, { body: OK_BODY });
  await __request("collection", "POST", "/checkout/initialize", { a: 1 });
  await __request("disbursement", "GET", "/payout/banks");
  assert.equal(calls[0].url, "https://cray.test/checkout/initialize");
  assert.equal(headersOf(calls[0]).Authorization, `Bearer ${COLLECTION_KEY}`);
  assert.equal(
    headersOf(calls[1]).Authorization,
    `Bearer ${DISBURSEMENT_KEY}`,
  );
  assert.equal(calls[0].init.body, '{"a":1}');
  assert.equal(calls[1].init.body, undefined);

  // The signature covers the byte-identical body string.
  const header = headersOf(calls[0])["X-Signature"];
  const [t, n] = [/t=(\d+)/.exec(header)![1], /n=([^,]+)/.exec(header)![1]];
  const hash = createHash("sha256").update('{"a":1}').digest("hex");
  const canonical = `POST\n/checkout/initialize\n${t}\n${n}\n${hash}`;
  assert.equal(
    verify(
      "sha256",
      Buffer.from(canonical),
      { key: publicKey, dsaEncoding: "der" },
      Buffer.from(header.split("v1=")[1], "base64"),
    ),
    true,
  );
});

test("request uses a new nonce on every call", async () => {
  stubFetch({ body: OK_BODY });
  await __request("collection", "GET", "/balance");
  await __request("collection", "GET", "/balance");
  const nonce = (call: Call) => /n=([^,]+)/.exec(headersOf(call)["X-Signature"])![1];
  assert.notEqual(nonce(calls[0]), nonce(calls[1]));
});

test("request accepts status true, 'success' or success: true", async () => {
  stubFetch(
    { body: { status: "success", data: {} } },
    { body: { success: true, data: {} } },
  );
  await __request("collection", "GET", "/balance");
  await __request("collection", "GET", "/balance");
});

test("request turns a non-2xx answer into a CrayError with status and code", async () => {
  stubFetch({
    status: 401,
    body: { status: false, code: "SIGNATURE_INVALID", message: "bad signature" },
  });
  await assert.rejects(
    __request("collection", "GET", "/balance"),
    (error: unknown) =>
      error instanceof CrayError &&
      error.status === 401 &&
      error.code === "SIGNATURE_INVALID" &&
      error.message === "bad signature",
  );
});

test("request treats status:false on HTTP 200 as an error", async () => {
  stubFetch({ body: { status: false, message: "no" } });
  await assert.rejects(
    __request("collection", "GET", "/balance"),
    (error: unknown) => error instanceof CrayError && error.status === 200,
  );
});

test("a network failure is status 0 and names neither key nor url", async () => {
  stubFetchThrowing(new Error(`connect failed https://cray.test ${COLLECTION_KEY}`));
  await assert.rejects(
    __request("collection", "GET", "/balance"),
    (error: unknown) =>
      error instanceof CrayError &&
      error.status === 0 &&
      !error.message.includes(COLLECTION_KEY) &&
      !error.message.includes("cray.test"),
  );
});

test("an error message has keys removed and long digit runs masked", async () => {
  stubFetch({
    status: 400,
    body: {
      status: false,
      message: `account 0123456789 key ${COLLECTION_KEY} not allowed`,
    },
  });
  await assert.rejects(
    __request("collection", "GET", "/balance"),
    (error: unknown) =>
      error instanceof CrayError &&
      error.message.includes("******6789") &&
      !error.message.includes("0123456789") &&
      !error.message.includes(COLLECTION_KEY),
  );
});

test("missing configuration is a CrayError that names no values", async () => {
  delete process.env.CRAY_COLLECTION_API_KEY;
  stubFetch({ body: OK_BODY });
  await assert.rejects(
    __request("collection", "GET", "/balance"),
    (error: unknown) =>
      error instanceof CrayError &&
      error.status === 0 &&
      !error.message.includes(PRIVATE_PEM),
  );
  assert.equal(calls.length, 0);
});

test("request passes a 15 second timeout signal", async () => {
  stubFetch({ body: OK_BODY });
  await __request("collection", "GET", "/balance");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("isCrayConfigured needs every variable", () => {
  assert.equal(isCrayConfigured(), true);
  for (const name of ENV_NAMES) {
    const saved = process.env[name];
    process.env[name] = "";
    assert.equal(isCrayConfigured(), false, name);
    process.env[name] = saved;
  }
});

// ---- endpoints ----

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

const REFERENCE = "pit_0123456789abcdef0123456789abcdef";

test("initializeCheckout sends naira text, card only, customer bears the fee", async () => {
  stubFetch({
    body: { status: true, data: { link: "https://checkout.cray.test/abc" } },
  });
  const result = await initializeCheckout({
    amountKobo: 5_270_000,
    reference: REFERENCE,
    email: "biz@example.com",
    name: "Biz Ltd",
    callbackUrl: "https://pitchype.test/return?reference=" + REFERENCE,
  });
  assert.deepEqual(result, { checkoutUrl: "https://checkout.cray.test/abc" });
  assert.equal(calls[0].url, "https://cray.test/checkout/initialize");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(headersOf(calls[0]).Authorization, `Bearer ${COLLECTION_KEY}`);
  assert.deepEqual(bodyOf(calls[0]), {
    amount: "52700.00",
    currency: "NGN",
    reference: REFERENCE,
    defaultPaymentMethod: "card",
    paymentMethods: ["card"],
    feeBearer: "customer",
    token: "sub_test_token",
    customer: { name: "Biz Ltd", email: "biz@example.com" },
    callback_url: "https://pitchype.test/return?reference=" + REFERENCE,
  });
});

test("initializeCheckout refuses a bad amount before fetching and a missing link", async () => {
  stubFetch({ body: { status: true, data: {} } });
  await assert.rejects(
    initializeCheckout({
      amountKobo: 0,
      reference: REFERENCE,
      email: "a@b.co",
      name: "A",
      callbackUrl: "https://x.test",
    }),
    CrayError,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    initializeCheckout({
      amountKobo: 100,
      reference: REFERENCE,
      email: "a@b.co",
      name: "A",
      callbackUrl: "https://x.test",
    }),
    CrayError,
  );
});

function checkoutData(overrides: Record<string, unknown> = {}) {
  return {
    status: "Successful",
    reference: REFERENCE,
    amount: "52700.00",
    fee: "200.00",
    net_amount: "52500.00",
    currency: "NGN",
    ...overrides,
  };
}

test("queryCheckout maps a successful payment to exact kobo", async () => {
  stubFetch({ body: { status: true, data: checkoutData() } });
  const result = await queryCheckout(REFERENCE);
  assert.equal(calls[0].url, `https://cray.test/checkout/query/${REFERENCE}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(result.status, "success");
  assert.equal(result.grossKobo, 5_270_000);
  assert.equal(result.feeKobo, 20_000);
  assert.equal(result.netKobo, 5_250_000);
  assert.equal(result.currency, "NGN");
  assert.equal(result.reference, REFERENCE);
});

test("queryCheckout maps failed, abandoned and everything else", async () => {
  for (const [text, want] of [
    ["Failed", "failed"],
    ["abandoned", "abandoned"],
    ["PENDING", "pending"],
    ["Processing", "pending"],
  ] as const) {
    stubFetch({ body: { status: true, data: checkoutData({ status: text }) } });
    assert.equal((await queryCheckout(REFERENCE)).status, want, text);
  }
});

test("queryCheckout refuses an answer for another reference", async () => {
  stubFetch({
    body: { status: true, data: checkoutData({ reference: "pit_other" }) },
  });
  await assert.rejects(queryCheckout(REFERENCE), CrayError);
});

test("queryCheckout refuses a success without all three amounts or with a fractional kobo", async () => {
  for (const missing of ["amount", "fee", "net_amount"]) {
    stubFetch({
      body: { status: true, data: checkoutData({ [missing]: undefined }) },
    });
    await assert.rejects(queryCheckout(REFERENCE), CrayError, missing);
  }
  stubFetch({ body: { status: true, data: checkoutData({ amount: "52700.005" }) } });
  await assert.rejects(queryCheckout(REFERENCE), CrayError);
});

test("queryCheckout returns a null currency when Cray sends none and rejects bad references before fetching", async () => {
  stubFetch({
    body: { status: true, data: checkoutData({ currency: undefined }) },
  });
  assert.equal((await queryCheckout(REFERENCE)).currency, null);
  const before = calls.length;
  await assert.rejects(queryCheckout("a/b?c"), CrayError);
  assert.equal(calls.length, before);
});

test("createPermanentAccount sends the Bloc permanent request and reads the account", async () => {
  stubFetch({
    body: {
      status: true,
      data: {
        id: "va_123",
        account_number: "9012345678",
        bank_name: "Bloc Bank",
        account_name: "Cray/Pitchype - Biz",
      },
    },
  });
  const result = await createPermanentAccount({
    reference: "pit_va_0123456789abcdef0123456789abcdef",
    accountName: "Pitchype - Biz",
    email: "biz@example.com",
  });
  assert.deepEqual(result, {
    providerAccountId: "va_123",
    accountNumber: "9012345678",
    bankName: "Bloc Bank",
    accountName: "Cray/Pitchype - Biz",
  });
  assert.equal(calls[0].url, "https://cray.test/virtual-accounts/create");
  assert.deepEqual(bodyOf(calls[0]), {
    type: "individual",
    virtual_account_type: "Permanent",
    currency: "NGN",
    provider: "Bloc",
    account_name: "Pitchype - Biz",
    customer_email: "biz@example.com",
    reference: "pit_va_0123456789abcdef0123456789abcdef",
  });
});

test("createPermanentAccount refuses an answer without a ten digit account number", async () => {
  stubFetch({
    body: {
      status: true,
      data: { id: "v", account_number: "123", bank_name: "B", account_name: "N" },
    },
  });
  await assert.rejects(
    createPermanentAccount({
      reference: "pit_va_x",
      accountName: "N",
      email: "a@b.co",
    }),
    CrayError,
  );
});

test("listBanks uses the disbursement key and keeps one entry per code", async () => {
  stubFetch({
    body: {
      status: true,
      data: [
        { bank_code: "000014", bank_name: "Access" },
        { bank_code: "000014", bank_name: "Access again" },
        { bank_code: "000013", bank_name: "GTB" },
        { bank_code: "", bank_name: "Nothing" },
      ],
    },
  });
  const banks = await listBanks();
  assert.equal(calls[0].url, "https://cray.test/payout/banks");
  assert.equal(headersOf(calls[0]).Authorization, `Bearer ${DISBURSEMENT_KEY}`);
  assert.deepEqual(banks, [
    { code: "000014", name: "Access" },
    { code: "000013", name: "GTB" },
  ]);
});

test("validateAccount returns the name and ref id, and refuses bad numbers before fetching", async () => {
  stubFetch({
    body: { status: true, data: { account_name: "JOHN DOE", ref_id: "ref_1" } },
  });
  const result = await validateAccount("0123456789", "000014");
  assert.deepEqual(result, { accountName: "JOHN DOE", refId: "ref_1" });
  assert.equal(calls[0].url, "https://cray.test/payout/accounts/validate");
  assert.deepEqual(bodyOf(calls[0]), {
    account_number: "0123456789",
    bank_code: "000014",
  });
  const before = calls.length;
  await assert.rejects(validateAccount("12345", "000014"), CrayError);
  await assert.rejects(validateAccount("0123456789", ""), CrayError);
  assert.equal(calls.length, before);
});

const DISBURSE_INPUT = {
  amountKobo: 995_000,
  reference: "pit_po_0123456789abcdef0123456789abcdef",
  accountNumber: "0123456789",
  bankCode: "000014",
  recipientName: "JOHN DOE",
  refId: "ref_1",
  narration: "Pitchype payout",
};

test("disburse sends naira text and the customer reference", async () => {
  stubFetch({
    body: { status: true, data: { reference: "TX123456", status: "pending" } },
  });
  const result = await disburse(DISBURSE_INPUT);
  assert.deepEqual(result, { providerReference: "TX123456", status: "pending" });
  assert.equal(calls[0].url, "https://cray.test/payout/disburse");
  assert.equal(headersOf(calls[0]).Authorization, `Bearer ${DISBURSEMENT_KEY}`);
  assert.deepEqual(bodyOf(calls[0]), {
    customer_reference: DISBURSE_INPUT.reference,
    amount: "9950.00",
    currency: "NGN",
    bank_code: "000014",
    account_number: "0123456789",
    recipient_name: "JOHN DOE",
    ref_id: "ref_1",
    narration: "Pitchype payout",
  });
});

test("disburse maps an insufficient balance refusal and a duplicate refusal", async () => {
  stubFetch({
    status: 400,
    body: { status: false, message: "Insufficient balance" },
  });
  await assert.rejects(
    disburse(DISBURSE_INPUT),
    (e: unknown) =>
      e instanceof CrayError &&
      e.code === "insufficient_balance" &&
      e.status === 400,
  );
  stubFetch({
    status: 400,
    body: { status: false, message: "Reference has already been used" },
  });
  await assert.rejects(
    disburse(DISBURSE_INPUT),
    (e: unknown) => e instanceof CrayError && e.code === "duplicate_reference",
  );
  stubFetch({ status: 500, body: { status: false, message: "boom" } });
  await assert.rejects(
    disburse(DISBURSE_INPUT),
    (e: unknown) => e instanceof CrayError && e.code === null,
  );
});

test("requeryPayout maps each status and reads amounts as exact kobo", async () => {
  for (const [text, want] of [
    ["approved", "success"],
    ["Successful", "success"],
    ["success", "success"],
    ["failed", "failed"],
    ["declined", "failed"],
    ["reversed", "reversed"],
    ["pending", "pending"],
    ["something new", "pending"],
  ] as const) {
    stubFetch({
      body: {
        status: true,
        data: {
          status: text,
          merchant_reference: "pit_po_x",
          amount: "9950.00",
          charge: "50.00",
        },
      },
    });
    const result = await requeryPayout("TX123456");
    assert.equal(result.status, want, text);
    assert.equal(result.merchantReference, "pit_po_x");
    assert.equal(result.sentKobo, 995_000);
    assert.equal(result.chargeKobo, 5_000);
  }
  assert.equal(calls[0].url, "https://cray.test/payout/requery/TX123456");
  assert.equal(headersOf(calls[0]).Authorization, `Bearer ${DISBURSEMENT_KEY}`);
});

test("requeryPayout gives a null charge when Cray sends none and refuses a success without an amount", async () => {
  stubFetch({
    body: {
      status: true,
      data: { status: "success", merchant_reference: "x", amount: 9950 },
    },
  });
  assert.equal((await requeryPayout("TX1")).chargeKobo, null);
  stubFetch({
    body: { status: true, data: { status: "success", merchant_reference: "x" } },
  });
  await assert.rejects(requeryPayout("TX1"), CrayError);
  const before = calls.length;
  await assert.rejects(requeryPayout("a/b"), CrayError);
  assert.equal(calls.length, before);
});

const BALANCES = [
  { name: "Main Balance", currency: "NGN", actual_balance: 50000 },
  {
    name: "Settlement Balance",
    currency: "NGN",
    available_balance: 1200,
    locked_balance: 0,
  },
  { name: "Dollar", currency: "USD", actual_balance: 99 },
];

test("getBalances sums the NGN accounts for either response shape", async () => {
  for (const data of [BALANCES, { accounts: BALANCES }]) {
    stubFetch({ body: { status: true, data } });
    const result = await getBalances();
    assert.equal(result.totalKobo, 5_120_000);
    assert.deepEqual(result.parts, [
      { name: "Main Balance", kobo: 5_000_000 },
      { name: "Settlement Balance", kobo: 120_000 },
    ]);
  }
  assert.equal(calls[0].url, "https://cray.test/balance?currency=NGN");
  assert.equal(headersOf(calls[0]).Authorization, `Bearer ${COLLECTION_KEY}`);
});

test("getMainBalanceKobo picks the main balance, or null", async () => {
  stubFetch({ body: { status: true, data: BALANCES } });
  assert.equal(await getMainBalanceKobo(), 5_000_000);
  stubFetch({
    body: {
      status: true,
      data: [{ name: "Settlement Balance", currency: "NGN", actual_balance: 5 }],
    },
  });
  assert.equal(await getMainBalanceKobo(), null);
});

// ---- webhook hash ----

function hashOf(serialised: string, key: string): string {
  return createHmac("sha256", key).update(serialised).digest("base64");
}

test("isValidWebhookHash accepts the key chosen by the hint", () => {
  const data = { reference: REFERENCE, amount: "10.00" };
  const hash = hashOf(JSON.stringify(data), "whk_test_abcd");
  assert.equal(isValidWebhookHash(data, hash, "abcd"), true);
  assert.equal(isValidWebhookHash(data, hash, null), true);
});

test("isValidWebhookHash rejects a changed field, a wrong hint, a bad hash and no keys", () => {
  const data = { reference: REFERENCE, amount: "10.00" };
  const hash = hashOf(JSON.stringify(data), "whk_test_abcd");
  assert.equal(isValidWebhookHash({ ...data, amount: "11.00" }, hash, "abcd"), false);
  assert.equal(isValidWebhookHash(data, hash, "zzzz"), false);
  assert.equal(isValidWebhookHash(data, "not-a-hash", "abcd"), false);
  assert.equal(isValidWebhookHash(data, undefined, "abcd"), false);
  assert.equal(isValidWebhookHash(data, 42, "abcd"), false);
  process.env.CRAY_WEBHOOK_KEYS = "";
  assert.equal(isValidWebhookHash(data, hash, "abcd"), false);
});

test("isValidWebhookHash supports two keys for rotation", () => {
  process.env.CRAY_WEBHOOK_KEYS = "whk_old_1111, whk_new_2222";
  const data = { a: 1 };
  for (const [key, hint] of [
    ["whk_old_1111", "1111"],
    ["whk_new_2222", "2222"],
  ]) {
    const hash = hashOf(JSON.stringify(data), key);
    assert.equal(isValidWebhookHash(data, hash, hint), true, key);
  }
});

test("isValidWebhookHash accepts PHP-style escaping of slashes and non-ASCII", () => {
  const data = { return_url: "https://x.test/a", name: "Ọlá" };
  const php = '{"return_url":"https:\\/\\/x.test\\/a","name":"\\u1eccl\\u00e1"}';
  const hash = hashOf(php, "whk_test_abcd");
  assert.equal(isValidWebhookHash(data, hash, "abcd"), true);
  const plain = hashOf(JSON.stringify(data), "whk_test_abcd");
  assert.equal(isValidWebhookHash(data, plain, "abcd"), true);
});
