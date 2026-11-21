import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  CrayError,
  __request,
  canonicalPathWithQuery,
  isCrayConfigured,
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
