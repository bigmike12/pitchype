import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import { MoneyStateError } from "./db/money-errors.ts";
import { CrayError } from "./cray.ts";
import {
  confirmCardPayment,
  confirmTransfer,
  crayCardFigures,
  handlePaystackWebhook,
  sendCrayPayout,
  stuckPayoutCutoff,
  type CardDeps,
  type PayoutRecord,
  type TransferDeps,
  type WebhookDeps,
} from "./payments.ts";
import { PaystackError } from "./paystack.ts";

const REF = "pit_0123456789abcdef0123456789abcdef";
const PO_REF = "pit_po_0123456789abcdef0123456789abcdef";
const SECRET = "sk_test_payments_unit_secret";

const realSecret = process.env.PAYSTACK_SECRET_KEY;
const realConsoleError = console.error;
let logged: string[] = [];

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.error = realConsoleError;
  if (realSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = realSecret;
});

// Card payments -------------------------------------------------------------------------------

type Verified = Awaited<ReturnType<CardDeps["verifyTransaction"]>>;
type Recorded = Parameters<CardDeps["recordCardPayment"]>[0];

function cardDeps(
  verified: Verified | (() => Promise<Verified>),
  recordResult:
    Awaited<ReturnType<CardDeps["recordCardPayment"]>> | Error = "funded",
) {
  const records: Recorded[] = [];
  const verifies: string[] = [];
  const deps: CardDeps = {
    // These tests are about Paystack payments: the row says so, and Cray is never asked.
    getPaymentProvider: async () => ({
      provider: "paystack",
      cardPartKobo: 5_250_000,
    }),
    queryCheckout: async () => {
      throw new Error("Cray must not be asked about a Paystack payment");
    },
    verifyTransaction: async (reference) => {
      verifies.push(reference);
      return typeof verified === "function" ? verified() : verified;
    },
    recordCardPayment: async (input) => {
      records.push(input);
      if (recordResult instanceof Error) throw recordResult;
      return recordResult;
    },
  };
  return { deps, records, verifies };
}

function success(overrides: Partial<Verified> = {}): Verified {
  return {
    status: "success",
    amountKobo: 5_250_000,
    feesKobo: 88_750,
    currency: "NGN",
    raw: {
      id: 4099260516,
      reference: REF,
      amount: 5_250_000,
      fees: 88_750,
      currency: "NGN",
      status: "success",
      channel: "card",
      paid_at: "2026-11-13T10:00:00.000Z",
      customer: { email: "owner@example.com", phone: "08012345678" },
      authorization: {
        authorization_code: "AUTH_secret",
        last4: "4081",
        bin: "408408",
      },
      metadata: { note: "anything" },
      log: { history: [] },
    },
    ...overrides,
  };
}

test("a verified card payment is recorded once with Paystack's amount and fee", async () => {
  const { deps, records, verifies } = cardDeps(success());
  const result = await confirmCardPayment(REF, deps);

  assert.equal(result, "funded");
  assert.deepEqual(verifies, [REF]);
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.reference, REF);
  assert.equal(record.paidKobo, 5_250_000);
  assert.equal(record.paystackFeeKobo, 88_750);
  assert.equal(record.eventKey, `charge.success:${REF}`);
  assert.deepEqual(Object.keys(record.payload as object).sort(), [
    "amount",
    "channel",
    "currency",
    "fees",
    "id",
    "paid_at",
    "reference",
    "status",
  ]);
  const stored = JSON.stringify(record.payload);
  for (const secret of [
    "owner@example.com",
    "08012345678",
    "AUTH_secret",
    "408408",
    "customer",
    "authorization",
  ]) {
    assert.ok(!stored.includes(secret), secret);
  }
});

test("payload values that are not plain values are dropped, never stored", async () => {
  const verified = success();
  (verified.raw as Record<string, unknown>).channel = {
    nested: "card details",
  };
  const { deps, records } = cardDeps(verified);
  await confirmCardPayment(REF, deps);
  assert.equal((records[0].payload as Record<string, unknown>).channel, null);
});

test("a payment Paystack still holds is pending and nothing is recorded", async () => {
  const { deps, records } = cardDeps(
    success({ status: "pending", feesKobo: 0 }),
  );
  assert.equal(await confirmCardPayment(REF, deps), "pending");
  assert.equal(records.length, 0);
});

test("failed and abandoned payments write nothing", async () => {
  for (const status of ["failed", "abandoned"] as const) {
    const { deps, records } = cardDeps(success({ status }));
    assert.equal(await confirmCardPayment(REF, deps), "failed");
    assert.equal(records.length, 0);
  }
});

test("a payment in another currency is a mismatch without touching the database", async () => {
  const { deps, records } = cardDeps(success({ currency: "USD" }));
  assert.equal(await confirmCardPayment(REF, deps), "mismatch");
  assert.equal(records.length, 0);
  // Logged for a person to follow up: the event and the reference, no amounts.
  assert.deepEqual(logged, ["card payment currency mismatch " + REF]);
});

test("a payment whose amount the database rejects is logged", async () => {
  const { deps } = cardDeps(success(), "mismatch");
  assert.equal(await confirmCardPayment(REF, deps), "mismatch");
  assert.deepEqual(logged, ["card payment amount mismatch " + REF]);
});

test("the database's own answers pass through", async () => {
  for (const answer of [
    "funded",
    "stranded",
    "duplicate",
    "mismatch",
  ] as const) {
    const { deps } = cardDeps(success(), answer);
    assert.equal(await confirmCardPayment(REF, deps), answer);
  }
});

test("a reference we never issued is unknown", async () => {
  const { deps } = cardDeps(success(), "unknown_reference");
  assert.equal(await confirmCardPayment(REF, deps), "unknown");
});

test("an impossible money state is left for review with one safe log line", async () => {
  const { deps } = cardDeps(
    success(),
    new MoneyStateError("payment_total_wrong"),
  );
  assert.equal(await confirmCardPayment(REF, deps), "needs_review");
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes(REF));
  assert.ok(logged[0].includes("payment_total_wrong"));
  assert.ok(!logged[0].includes(SECRET));
  assert.ok(!logged[0].includes("5250000"));
  assert.ok(!logged[0].includes("owner@example.com"));
});

test("other errors propagate", async () => {
  const paystackDown = cardDeps(async () => {
    throw new PaystackError("Could not reach Paystack", 0);
  });
  await assert.rejects(
    confirmCardPayment(REF, paystackDown.deps),
    PaystackError,
  );
  assert.equal(paystackDown.records.length, 0);

  const dbDown = cardDeps(success(), new Error("record failed (08006)"));
  await assert.rejects(confirmCardPayment(REF, dbDown.deps), /record failed/);
});

// Transfers -----------------------------------------------------------------------------------

type Finished = Parameters<TransferDeps["finishPayout"]>[0];
type TransferVerified = Awaited<ReturnType<TransferDeps["verifyTransfer"]>>;

const NOW = new Date("2026-11-13T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

// The Paystack-only tests never reach Cray: these stubs fail loudly if they do.
const refuse = async (): Promise<never> => {
  throw new Error("Cray must not be called for a Paystack payout");
};
const NO_CRAY = {
  requeryPayout: refuse,
  validateAccount: refuse,
  disburse: refuse,
  decryptAccountNumber: () => {
    throw new Error("Cray must not be called for a Paystack payout");
  },
  recordPayoutSend: refuse,
  flagPayout: refuse,
};
const PAYSTACK_PAYOUT = {
  provider: "paystack" as const,
  reference: PO_REF,
  providerReference: null,
  sendKobo: 4_742_500,
  bankCode: null,
  accountNumberEncrypted: null,
  accountName: "CHIDI OKAFOR",
};

function transferDeps(
  verified: TransferVerified,
  options: {
    payout?: { id: string; status: string; approvedAt: string | null } | null;
    finishResult?: Awaited<ReturnType<TransferDeps["finishPayout"]>>;
  } = {},
) {
  const finishes: Finished[] = [];
  const verifies: string[] = [];
  const payout: PayoutRecord | null =
    options.payout === undefined
      ? {
          id: "payout-1",
          status: "processing",
          approvedAt: minutesAgo(1),
          ...PAYSTACK_PAYOUT,
        }
      : options.payout === null
        ? null
        : { ...PAYSTACK_PAYOUT, ...options.payout };
  const deps: TransferDeps = {
    ...NO_CRAY,
    getPayoutByReference: async () => payout,
    verifyTransfer: async (reference) => {
      verifies.push(reference);
      return verified;
    },
    finishPayout: async (input) => {
      finishes.push(input);
      return options.finishResult ?? input.outcome;
    },
    now: () => NOW,
  };
  return { deps, finishes, verifies };
}

const transferRaw = {
  id: 37272792,
  reference: PO_REF,
  status: "success",
  amount: 4_742_500,
  transfer_code: "TRF_abc",
  transferred_at: "2026-11-13T11:59:00.000Z",
  recipient: {
    details: { account_number: "9876543210", bank_name: "Test Bank" },
  },
};

test("a successful transfer marks the payout paid with a trimmed payload", async () => {
  const { deps, finishes } = transferDeps({
    status: "success",
    raw: transferRaw,
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "paid");
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].outcome, "paid");
  assert.equal(finishes[0].eventKey, `transfer.success:${PO_REF}`);
  assert.equal(finishes[0].reference, PO_REF);
  assert.deepEqual(Object.keys(finishes[0].payload as object).sort(), [
    "amount",
    "id",
    "reference",
    "status",
    "transfer_code",
    "transferred_at",
  ]);
  assert.ok(!JSON.stringify(finishes[0].payload).includes("9876543210"));
});

test("failed and reversed count only because Paystack reports them", async () => {
  for (const status of ["failed", "reversed"] as const) {
    const { deps, finishes } = transferDeps({
      status,
      raw: { ...transferRaw, status },
    });
    assert.equal(await confirmTransfer(PO_REF, deps), "failed");
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0].outcome, "failed");
    assert.equal(finishes[0].eventKey, `transfer.${status}:${PO_REF}`);
  }
});

test("a pending transfer writes nothing", async () => {
  const { deps, finishes } = transferDeps({
    status: "pending",
    raw: transferRaw,
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "pending");
  assert.equal(finishes.length, 0);
});

test("a transfer Paystack can't find fails only after 15 minutes in processing", async () => {
  const early = transferDeps(
    { status: "not_found", raw: null },
    { payout: { id: "p", status: "processing", approvedAt: minutesAgo(5) } },
  );
  assert.equal(await confirmTransfer(PO_REF, early.deps), "pending");
  assert.equal(early.finishes.length, 0);

  const late = transferDeps(
    { status: "not_found", raw: null },
    { payout: { id: "p", status: "processing", approvedAt: minutesAgo(20) } },
  );
  assert.equal(await confirmTransfer(PO_REF, late.deps), "failed");
  assert.equal(late.finishes.length, 1);
  assert.equal(late.finishes[0].outcome, "failed");
  assert.equal(late.finishes[0].eventKey, `transfer.not_found:${PO_REF}`);
});

test("an ignored transfer result is logged and returned", async () => {
  const { deps } = transferDeps(
    { status: "failed", raw: transferRaw },
    { finishResult: "ignored" },
  );
  assert.equal(await confirmTransfer(PO_REF, deps), "ignored");
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes("payout event ignored"));
  assert.ok(logged[0].includes(PO_REF));
});

test("a reference with no payout is unknown and Paystack isn't asked", async () => {
  const { deps, verifies, finishes } = transferDeps(
    { status: "success", raw: transferRaw },
    { payout: null },
  );
  assert.equal(await confirmTransfer(PO_REF, deps), "unknown");
  assert.equal(verifies.length, 0);
  assert.equal(finishes.length, 0);
});

test("transfer and card event keys never collide", async () => {
  const card = cardDeps(success());
  await confirmCardPayment(REF, card.deps);
  const transfer = transferDeps({ status: "success", raw: transferRaw });
  await confirmTransfer(PO_REF, transfer.deps);
  assert.ok(card.records[0].eventKey.startsWith("charge.success:"));
  assert.ok(transfer.finishes[0].eventKey.startsWith("transfer.success:"));
});

test("stuckPayoutCutoff is exactly 15 minutes earlier", () => {
  assert.equal(
    stuckPayoutCutoff(NOW).toISOString(),
    "2026-11-13T11:45:00.000Z",
  );
});

// Webhook -------------------------------------------------------------------------------------

const sign = (body: string) =>
  createHmac("sha512", SECRET).update(body).digest("hex");

function webhookDeps(
  card: () => Promise<
    Awaited<ReturnType<WebhookDeps["confirmCardPayment"]>>
  > = async () => "funded",
  transfer: () => Promise<
    Awaited<ReturnType<WebhookDeps["confirmTransfer"]>>
  > = async () => "paid",
) {
  const cardCalls: string[] = [];
  const transferCalls: string[] = [];
  const deps: WebhookDeps = {
    confirmCardPayment: async (reference) => {
      cardCalls.push(reference);
      return card();
    },
    confirmTransfer: async (reference) => {
      transferCalls.push(reference);
      return transfer();
    },
  };
  return { deps, cardCalls, transferCalls };
}

const event = (name: string, reference: unknown) =>
  JSON.stringify({
    event: name,
    data: { reference, amount: 1, status: "success" },
  });

test("a bad or missing signature is refused before the body is read", async () => {
  const notJson = "{this is not json";
  for (const signature of [null, "", "deadbeef", sign("something else")]) {
    const { deps, cardCalls, transferCalls } = webhookDeps();
    const response = await handlePaystackWebhook(notJson, signature, deps);
    assert.equal(response.status, 401);
    assert.equal(response.body.ok, false);
    assert.equal(cardCalls.length + transferCalls.length, 0);
  }
  const good = event("charge.success", REF);
  const { deps, cardCalls } = webhookDeps();
  const wrong = await handlePaystackWebhook(good, sign(good + " "), deps);
  assert.equal(wrong.status, 401);
  assert.equal(cardCalls.length, 0);
});

test("a signed body that isn't JSON is a 400", async () => {
  const body = "{this is not json";
  const { deps } = webhookDeps();
  const response = await handlePaystackWebhook(body, sign(body), deps);
  assert.equal(response.status, 400);
});

test("charge.success with our reference confirms that payment once", async () => {
  const body = event("charge.success", REF);
  const { deps, cardCalls, transferCalls } = webhookDeps();
  const response = await handlePaystackWebhook(body, sign(body), deps);
  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, result: "funded" },
  });
  assert.deepEqual(cardCalls, [REF]);
  assert.equal(transferCalls.length, 0);
});

test("references and events that aren't ours are ignored", async () => {
  for (const body of [
    event("charge.success", "T123456789"),
    event("charge.success", PO_REF),
    event("charge.success", 42),
    event("charge.success", "pit_not-ours"),
    event("transfer.success", REF),
    event("subscription.create", REF),
    JSON.stringify({ event: "charge.success" }),
    JSON.stringify([1, 2]),
  ]) {
    const { deps, cardCalls, transferCalls } = webhookDeps();
    const response = await handlePaystackWebhook(body, sign(body), deps);
    assert.deepEqual(
      response,
      { status: 200, body: { ok: true, result: "ignored" } },
      body,
    );
    assert.equal(cardCalls.length + transferCalls.length, 0, body);
  }
});

test("transfer events with a payout reference confirm the transfer", async () => {
  for (const name of [
    "transfer.success",
    "transfer.failed",
    "transfer.reversed",
  ]) {
    const body = event(name, PO_REF);
    const { deps, cardCalls, transferCalls } = webhookDeps();
    const response = await handlePaystackWebhook(body, sign(body), deps);
    assert.equal(response.status, 200);
    assert.deepEqual(transferCalls, [PO_REF]);
    assert.equal(cardCalls.length, 0);
  }
});

test("a charge Paystack still calls pending asks for a retry", async () => {
  const body = event("charge.success", REF);
  const { deps } = webhookDeps(async () => "pending");
  const response = await handlePaystackWebhook(body, sign(body), deps);
  assert.equal(response.status, 503);
});

test("a pending transfer is acknowledged: the poller covers it", async () => {
  const body = event("transfer.success", PO_REF);
  const { deps } = webhookDeps(undefined, async () => "pending");
  const response = await handlePaystackWebhook(body, sign(body), deps);
  assert.equal(response.status, 200);
});

test("outcomes that need a person still answer 200", async () => {
  for (const outcome of [
    "needs_review",
    "unknown",
    "mismatch",
    "stranded",
    "duplicate",
    "failed",
  ] as const) {
    const body = event("charge.success", REF);
    const { deps } = webhookDeps(async () => outcome);
    const response = await handlePaystackWebhook(body, sign(body), deps);
    assert.deepEqual(response, {
      status: 200,
      body: { ok: true, result: outcome },
    });
  }
});

test("Paystack outages and unexpected errors return 500 so Paystack retries", async () => {
  for (const error of [
    new PaystackError("Could not reach Paystack", 0),
    new PaystackError("Bad gateway", 502),
    new Error("database down"),
  ]) {
    const body = event("charge.success", REF);
    const { deps } = webhookDeps(async () => {
      throw error;
    });
    const response = await handlePaystackWebhook(body, sign(body), deps);
    assert.equal(response.status, 500);
    assert.equal(response.body.ok, false);
    assert.ok(!logged.join("\n").includes(SECRET));
  }
});

test("a Paystack 4xx is logged once and acknowledged", async () => {
  const body = event("transfer.failed", PO_REF);
  const { deps } = webhookDeps(undefined, async () => {
    throw new PaystackError("Transfer not found", 404);
  });
  const response = await handlePaystackWebhook(body, sign(body), deps);
  assert.equal(response.status, 200);
  assert.equal(logged.length, 1);
  assert.ok(!logged[0].includes(body));
});

test("the same event twice calls through both times (idempotency lives in the database)", async () => {
  const body = event("charge.success", REF);
  let calls = 0;
  const { deps, cardCalls } = webhookDeps(async () =>
    ++calls === 1 ? "funded" : "duplicate",
  );
  const first = await handlePaystackWebhook(body, sign(body), deps);
  const second = await handlePaystackWebhook(body, sign(body), deps);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.result, "duplicate");
  assert.equal(cardCalls.length, 2);
});

test("Paystack rate limits and key errors are retried; only an unknown reference is acknowledged", async () => {
  const cases: [number, number][] = [
    [429, 500],
    [401, 500],
    [403, 500],
    [400, 200],
    [404, 200],
  ];
  for (const [paystackStatus, expected] of cases) {
    const fail = async (): Promise<never> => {
      throw new PaystackError("Paystack said no", paystackStatus);
    };
    const charge = event("charge.success", REF);
    const card = webhookDeps(fail);
    const cardResponse = await handlePaystackWebhook(
      charge,
      sign(charge),
      card.deps,
    );
    assert.equal(cardResponse.status, expected, `charge ${paystackStatus}`);

    const transfer = event("transfer.reversed", PO_REF);
    const payout = webhookDeps(undefined, fail);
    const payoutResponse = await handlePaystackWebhook(
      transfer,
      sign(transfer),
      payout.deps,
    );
    assert.equal(payoutResponse.status, expected, `transfer ${paystackStatus}`);
  }
});

test("a not_found from Paystack never fails a payout that isn't processing", async () => {
  for (const status of ["requested", "paid", "failed", "rejected"]) {
    const { deps, finishes } = transferDeps(
      { status: "not_found", raw: null },
      { payout: { id: "p", status, approvedAt: minutesAgo(60) } },
    );
    assert.equal(await confirmTransfer(PO_REF, deps), "pending", status);
    assert.equal(finishes.length, 0, status);
  }
});

// Cray card payments ----------------------------------------------------------------------------

type CrayQuery = Awaited<ReturnType<CardDeps["queryCheckout"]>>;

function crayQuery(overrides: Partial<CrayQuery> = {}): CrayQuery {
  return {
    status: "success",
    reference: REF,
    grossKobo: 5_270_000,
    feeKobo: 20_000,
    netKobo: 5_250_000,
    currency: "NGN",
    raw: {
      id: "chk_1",
      reference: REF,
      status: "Successful",
      amount: "52700.00",
      fee: "200.00",
      net_amount: "52500.00",
      currency: "NGN",
      customer: { email: "owner@example.com", phone: "08012345678" },
      card: { last4: "4081", bin: "408408" },
    },
    ...overrides,
  };
}

function crayCardDeps(
  query: CrayQuery | (() => Promise<CrayQuery>),
  cardPartKobo = 5_250_000,
  recordResult: Awaited<ReturnType<CardDeps["recordCardPayment"]>> = "funded",
) {
  const records: Recorded[] = [];
  const queries: string[] = [];
  const deps: CardDeps = {
    getPaymentProvider: async () => ({ provider: "cray", cardPartKobo }),
    queryCheckout: async (reference) => {
      queries.push(reference);
      return typeof query === "function" ? query() : query;
    },
    verifyTransaction: async () => {
      throw new Error("Paystack must not be asked about a Cray payment");
    },
    recordCardPayment: async (input) => {
      records.push(input);
      return recordResult;
    },
  };
  return { deps, records, queries };
}

test("crayCardFigures: the business carried Cray's charge", () => {
  assert.deepEqual(
    crayCardFigures(
      { grossKobo: 5_270_000, feeKobo: 20_000, netKobo: 5_250_000 },
      5_250_000,
    ),
    { paidKobo: 5_250_000, processorFeeKobo: 0, borneBy: "business" },
  );
});

test("crayCardFigures: a charge on our side is recorded and flagged", () => {
  assert.deepEqual(
    crayCardFigures(
      { grossKobo: 5_250_000, feeKobo: 78_750, netKobo: 5_171_250 },
      5_250_000,
    ),
    { paidKobo: 5_250_000, processorFeeKobo: 78_750, borneBy: "us" },
  );
  assert.equal(logged.length, 1);
  assert.match(
    logged[0],
    /cray charged us for a card payment; check feeBearer/,
  );
});

test("crayCardFigures: anything else is a mismatch carrying what was paid", () => {
  assert.deepEqual(
    crayCardFigures(
      { grossKobo: 4_000_000, feeKobo: 20_000, netKobo: 3_980_000 },
      5_250_000,
    ),
    { paidKobo: 4_000_000, processorFeeKobo: 20_000, borneBy: "mismatch" },
  );
});

test("a verified Cray card payment funds with the card part and no charge on our side", async () => {
  const { deps, records, queries } = crayCardDeps(crayQuery());
  assert.equal(await confirmCardPayment(REF, deps), "funded");
  assert.deepEqual(queries, [REF]);
  assert.equal(records.length, 1);
  assert.equal(records[0].paidKobo, 5_250_000);
  assert.equal(records[0].paystackFeeKobo, 0);
  assert.equal(records[0].eventKey, `cray.charge:${REF}`);
  const stored = JSON.stringify(records[0].payload);
  for (const secret of ["owner@example.com", "08012345678", "4081", "408408"]) {
    assert.ok(!stored.includes(secret), secret);
  }
});

test("a Cray payment still pending, failed or abandoned records nothing", async () => {
  for (const [status, want] of [
    ["pending", "pending"],
    ["failed", "failed"],
    ["abandoned", "failed"],
  ] as const) {
    const { deps, records } = crayCardDeps(crayQuery({ status }));
    assert.equal(await confirmCardPayment(REF, deps), want, status);
    assert.equal(records.length, 0, status);
  }
});

test("a Cray payment in another currency is a mismatch and an absent currency is accepted", async () => {
  const usd = crayCardDeps(crayQuery({ currency: "USD" }));
  assert.equal(await confirmCardPayment(REF, usd.deps), "mismatch");
  assert.equal(usd.records.length, 0);

  const none = crayCardDeps(crayQuery({ currency: null }));
  assert.equal(await confirmCardPayment(REF, none.deps), "funded");
});

test("a Cray payment of the wrong amount is passed to the database to refuse", async () => {
  const { deps, records } = crayCardDeps(
    crayQuery({ grossKobo: 4_000_000, feeKobo: 20_000, netKobo: 3_980_000 }),
    5_250_000,
    "mismatch",
  );
  assert.equal(await confirmCardPayment(REF, deps), "mismatch");
  assert.equal(records[0].paidKobo, 4_000_000);
  assert.deepEqual(logged, ["card payment amount mismatch " + REF]);
});

test("a reference with no payment row is unknown and neither provider is asked", async () => {
  const { deps, queries } = crayCardDeps(crayQuery());
  deps.getPaymentProvider = async () => null;
  assert.equal(await confirmCardPayment(REF, deps), "unknown");
  assert.equal(queries.length, 0);
});

test("a Cray outage while verifying propagates so the caller retries", async () => {
  const { deps } = crayCardDeps(async () => {
    throw new CrayError("Could not reach Cray", 0);
  });
  await assert.rejects(confirmCardPayment(REF, deps), CrayError);
});

// Cray payouts ----------------------------------------------------------------------------------

const CRAY_ID = "CRAY0001";
const CIPHERTEXT = "v1:aXY=:dGFn:Y2lwaGVy";

function crayPayout(overrides: Partial<PayoutRecord> = {}): PayoutRecord {
  return {
    id: "payout-1",
    status: "processing",
    provider: "cray",
    reference: PO_REF,
    providerReference: null,
    approvedAt: minutesAgo(1),
    sendKobo: 1_995_000,
    bankCode: "000013",
    accountNumberEncrypted: CIPHERTEXT,
    accountName: "CHIDI OKAFOR",
    ...overrides,
  };
}

type Requery = Awaited<ReturnType<TransferDeps["requeryPayout"]>>;

function requery(overrides: Partial<Requery> = {}): Requery {
  return {
    status: "success",
    merchantReference: PO_REF,
    sentKobo: 1_995_000,
    chargeKobo: 5_000,
    raw: {
      id: CRAY_ID,
      status: "approved",
      merchant_reference: PO_REF,
      amount: "19950.00",
      charge: "50.00",
      account_number: "5551234567",
      recipient: { name: "CHIDI OKAFOR" },
    },
    ...overrides,
  };
}

function crayTransferDeps(
  options: {
    payout?: PayoutRecord | null;
    requery?: Requery | Error;
    validate?: { accountName: string; refId: string } | Error;
    disburse?: { providerReference: string; status: string } | Error;
    finishResult?: Awaited<ReturnType<TransferDeps["finishPayout"]>>;
    sendRecorded?: "set" | "already_set" | "conflict";
  } = {},
) {
  const finishes: Finished[] = [];
  const disburses: Parameters<TransferDeps["disburse"]>[0][] = [];
  const validates: string[] = [];
  const decrypts: string[] = [];
  const sends: [string, string][] = [];
  const flags: [string, string][] = [];
  const payout = options.payout === undefined ? crayPayout() : options.payout;
  const deps: TransferDeps = {
    getPayoutByReference: async () => payout,
    verifyTransfer: async () => {
      throw new Error("Paystack must not be asked about a Cray payout");
    },
    requeryPayout: async () => {
      const value = options.requery ?? requery();
      if (value instanceof Error) throw value;
      return value;
    },
    validateAccount: async (accountNumber) => {
      validates.push(accountNumber);
      const value = options.validate ?? {
        accountName: "Chidi  Okafor",
        refId: "ref_1",
      };
      if (value instanceof Error) throw value;
      return value;
    },
    disburse: async (input) => {
      disburses.push(input);
      const value = options.disburse ?? {
        providerReference: CRAY_ID,
        status: "pending",
      };
      if (value instanceof Error) throw value;
      return value;
    },
    decryptAccountNumber: (stored) => {
      decrypts.push(stored);
      return "0123456789";
    },
    recordPayoutSend: async (reference, providerReference) => {
      sends.push([reference, providerReference]);
      return options.sendRecorded ?? "set";
    },
    flagPayout: async (reference, flag) => {
      flags.push([reference, flag]);
    },
    finishPayout: async (input) => {
      finishes.push(input);
      return options.finishResult ?? input.outcome;
    },
    now: () => NOW,
  };
  return { deps, finishes, disburses, validates, decrypts, sends, flags };
}

test("a Cray payout with no id is sent once, with the decrypted number and the amount we owe", async () => {
  const { deps, disburses, validates, decrypts, sends, finishes } =
    crayTransferDeps();
  assert.equal(await confirmTransfer(PO_REF, deps), "sent");
  assert.deepEqual(decrypts, [CIPHERTEXT]);
  assert.deepEqual(validates, ["0123456789"]);
  assert.equal(disburses.length, 1);
  assert.deepEqual(disburses[0], {
    amountKobo: 1_995_000,
    reference: PO_REF,
    accountNumber: "0123456789",
    bankCode: "000013",
    recipientName: "Chidi  Okafor",
    refId: "ref_1",
    narration: "Pitchype payout",
  });
  assert.deepEqual(sends, [[PO_REF, CRAY_ID]]);
  assert.equal(finishes.length, 0);
});

test("a name that no longer matches sends nothing", async () => {
  const { deps, disburses, sends } = crayTransferDeps({
    validate: { accountName: "SOMEONE ELSE", refId: "ref_1" },
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "name_changed");
  assert.equal(disburses.length, 0);
  assert.equal(sends.length, 0);
});

test("names match without regard to case or spacing", async () => {
  const { deps, disburses } = crayTransferDeps({
    validate: { accountName: "  chidi OKAFOR ", refId: "ref_1" },
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "sent");
  assert.equal(disburses.length, 1);
});

test("Cray refusing for a short balance flags the payout and sends nothing", async () => {
  const { deps, flags, sends, finishes } = crayTransferDeps({
    disburse: new CrayError(
      "Insufficient balance",
      400,
      "insufficient_balance",
    ),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "waiting_for_funds");
  assert.deepEqual(flags, [[PO_REF, "waiting_for_funds"]]);
  assert.equal(sends.length, 0);
  assert.equal(finishes.length, 0);
});

test("Cray rejecting our reference as a duplicate needs an admin, and never fails or re-credits", async () => {
  const { deps, flags, sends, finishes } = crayTransferDeps({
    disburse: new CrayError("duplicate", 400, "duplicate_reference"),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "needs_reference");
  assert.deepEqual(flags, [[PO_REF, "needs_reference"]]);
  assert.equal(sends.length, 0);
  assert.equal(finishes.length, 0);
});

test("a disburse that times out leaves the payout processing for the next check", async () => {
  const { deps, flags, finishes } = crayTransferDeps({
    disburse: new CrayError("Could not reach Cray", 0),
  });
  await assert.rejects(confirmTransfer(PO_REF, deps), CrayError);
  assert.equal(flags.length, 0);
  assert.equal(finishes.length, 0);
});

test("a payout that is not processing and has no id is not sent", async () => {
  const { deps, disburses } = crayTransferDeps({
    payout: crayPayout({ status: "failed" }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "ignored");
  assert.equal(disburses.length, 0);
});

test("sendCrayPayout can be called directly for an approval", async () => {
  const { deps, disburses } = crayTransferDeps();
  const result = await sendCrayPayout(
    {
      reference: PO_REF,
      bankCode: "000013",
      accountNumberEncrypted: CIPHERTEXT,
      accountName: "CHIDI OKAFOR",
      sendKobo: 1_995_000,
    },
    deps,
  );
  assert.equal(result, "sent");
  assert.equal(disburses[0].amountKobo, 1_995_000);
});

test("a Cray payout with an id is paid only when the requery agrees on reference and amount", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "paid");
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].outcome, "paid");
  assert.equal(finishes[0].eventKey, `cray.payout.success:${CRAY_ID}`);
  assert.equal(finishes[0].sentKobo, 1_995_000);
  assert.equal(finishes[0].chargeKobo, 5_000);
  const stored = JSON.stringify(finishes[0].payload);
  assert.ok(!stored.includes("5551234567"));
  assert.ok(!stored.includes("account_number"));
  assert.ok(!stored.includes("recipient"));
});

test("a requery for another payout's reference is ignored", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID }),
    requery: requery({ merchantReference: "pit_po_other" }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "ignored");
  assert.equal(finishes.length, 0);
});

test("a requery for a different amount is ignored and logged", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID }),
    requery: requery({ sentKobo: 2_000_000 }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "ignored");
  assert.equal(finishes.length, 0);
  assert.ok(
    logged.some((line) => line.includes("cray payout amount mismatch")),
  );
});

test("a failed Cray payout is failed only because Cray says so", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID }),
    requery: requery({ status: "failed", sentKobo: 0, chargeKobo: null }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "failed");
  assert.equal(finishes[0].outcome, "failed");
  assert.equal(finishes[0].eventKey, `cray.payout.failed:${CRAY_ID}`);
});

test("a pending Cray payout writes nothing, however long it has waited", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({
      providerReference: CRAY_ID,
      approvedAt: new Date(NOW.getTime() - 72 * 3_600_000).toISOString(),
    }),
    requery: requery({ status: "pending", sentKobo: 0, chargeKobo: null }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "pending");
  assert.equal(finishes.length, 0);
});

test("Cray not finding the payout is an error, never a failure", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({
      providerReference: CRAY_ID,
      approvedAt: new Date(NOW.getTime() - 72 * 3_600_000).toISOString(),
    }),
    requery: new CrayError("not found", 404),
  });
  await assert.rejects(confirmTransfer(PO_REF, deps), CrayError);
  assert.equal(finishes.length, 0);
});

test("a payout Cray reverses after we recorded it paid is reversed", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID, status: "paid" }),
    requery: requery({ status: "reversed", chargeKobo: null }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "reversed");
  assert.equal(finishes[0].outcome, "reversed");
  assert.equal(finishes[0].eventKey, `cray.payout.reversed:${CRAY_ID}`);
  assert.equal(finishes[0].sentKobo, 1_995_000);
});

test("a payout Cray reversed before we recorded it paid is a failure", async () => {
  const { deps, finishes } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID }),
    requery: requery({ status: "reversed", chargeKobo: null }),
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "failed");
  assert.equal(finishes[0].outcome, "failed");
});

test("an ignored Cray result is logged", async () => {
  const { deps } = crayTransferDeps({
    payout: crayPayout({ providerReference: CRAY_ID }),
    finishResult: "ignored",
  });
  assert.equal(await confirmTransfer(PO_REF, deps), "ignored");
  assert.ok(logged.some((line) => line.includes("payout event ignored")));
});

test("Cray, card and Paystack event keys never collide", () => {
  const keys = [
    `charge.success:${REF}`,
    `cray.charge:${REF}`,
    `transfer.success:${PO_REF}`,
    `cray.payout.success:${CRAY_ID}`,
  ];
  assert.equal(new Set(keys).size, keys.length);
});
