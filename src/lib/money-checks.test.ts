import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  cronStatus,
  runMoneyChecks,
  type MoneyChecksResult,
  type MoneyCheckDeps,
} from "./money-checks.ts";
import { CrayError } from "./cray.ts";
import {
  stuckPayoutCutoff,
  type CardPaymentResult,
  type TransferResult,
} from "./payments.ts";
import { PaystackError } from "./paystack.ts";

const NOW = new Date("2026-11-13T03:30:00.000Z");
const RECON = {
  expectedCashKobo: 5_000_000,
  differenceKobo: -250,
  ledgerBalanced: true,
};

const realConsoleError = console.error;
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.error = realConsoleError;
});

type Script = {
  payouts?: string[];
  results?: Record<string, TransferResult | Error>;
  balance?: number | Error;
  recordFails?: Error;
  // Cray (off unless a test turns it on).
  crayConfigured?: boolean;
  paystackConfigured?: boolean;
  crayPayouts?: string[];
  cardPayments?: string[];
  cardResults?: Record<string, CardPaymentResult | Error>;
  crayBalances?:
    { totalKobo: number; parts: { name: string; kobo: number }[] } | Error;
  crayRecordFails?: Error;
};

function fakes(script: Script = {}) {
  const calls: string[] = [];
  const state = {
    cutoff: null as Date | null,
    recorded: [] as number[],
    crayRecorded: [] as {
      balance: number;
      parts: { name: string; kobo: number }[];
    }[],
    cardWindow: null as {
      olderThan: Date;
      newerThan: Date;
      limit: number;
    } | null,
  };
  const deps: MoneyCheckDeps = {
    isPaystackConfigured: () => script.paystackConfigured ?? true,
    isCrayConfigured: () => script.crayConfigured ?? false,
    listProcessingCrayPayouts: async () =>
      (script.crayPayouts ?? []).map((reference, i) => ({
        id: `cray-id-${i}`,
        reference,
      })),
    listInitiatedCrayCardPayments: async (olderThan, newerThan, limit) => {
      state.cardWindow = { olderThan, newerThan, limit };
      return (script.cardPayments ?? []).map((reference) => ({ reference }));
    },
    confirmCardPayment: async (reference) => {
      calls.push(`card:${reference}`);
      const result = script.cardResults?.[reference] ?? "funded";
      if (result instanceof Error) throw result;
      return result;
    },
    getCrayBalances: async () => {
      calls.push("cray-balance");
      const value = script.crayBalances ?? {
        totalKobo: 7_000_000,
        parts: [{ name: "Main Balance", kobo: 7_000_000 }],
      };
      if (value instanceof Error) throw value;
      return value;
    },
    recordCrayReconciliation: async (balance, parts) => {
      calls.push("cray-record");
      if (script.crayRecordFails) throw script.crayRecordFails;
      state.crayRecorded.push({ balance, parts });
      return RECON;
    },
    listProcessingPayoutsOlderThan: async (cutoff) => {
      state.cutoff = cutoff;
      return (script.payouts ?? []).map((reference, i) => ({
        id: `id-${i}`,
        reference,
      }));
    },
    confirmTransfer: async (reference) => {
      calls.push(`start:${reference}`);
      await Promise.resolve();
      calls.push(`end:${reference}`);
      const result = script.results?.[reference] ?? "pending";
      if (result instanceof Error) throw result;
      return result;
    },
    getBalanceKobo: async () => {
      calls.push("balance");
      const balance = script.balance ?? 5_000_250;
      if (balance instanceof Error) throw balance;
      return balance;
    },
    recordReconciliation: async (balance) => {
      calls.push("record");
      if (script.recordFails) throw script.recordFails;
      state.recorded.push(balance);
      return RECON;
    },
  };
  return { deps, calls, state };
}

test("no stuck payouts: zero counts and the reconciliation is still recorded", async () => {
  const { deps, state } = fakes();
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(result, {
    payoutsChecked: 0,
    payoutsSettled: 0,
    payoutsStillPending: 0,
    payoutsErrored: 0,
    payoutsLookupError: false,
    cardPaymentsChecked: 0,
    cardPaymentsFunded: 0,
    cardPaymentsErrored: 0,
    cardPaymentsLookupError: false,
    reconciliation: RECON,
    reconciliationError: false,
    reconciliations: [{ provider: "paystack", ok: true }],
  });
  assert.deepEqual(state.recorded, [5_000_250]);
});

test("paid, failed and pending are counted; the cutoff is 15 minutes before now", async () => {
  const { deps, state } = fakes({
    payouts: ["a", "b", "c"],
    results: { a: "paid", b: "failed", c: "pending" },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsChecked, 3);
  assert.equal(result.payoutsSettled, 2);
  assert.equal(result.payoutsStillPending, 1);
  assert.equal(result.payoutsErrored, 0);
  assert.deepEqual(state.cutoff, stuckPayoutCutoff(NOW));
  assert.equal(state.cutoff?.toISOString(), "2026-11-13T03:15:00.000Z");
});

test("a throwing confirmTransfer does not stop the others, which run one at a time in order", async () => {
  const { deps, calls } = fakes({
    payouts: ["a", "b", "c"],
    results: { a: "paid", b: new PaystackError("boom", 500), c: "failed" },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsChecked, 3);
  assert.equal(result.payoutsErrored, 1);
  assert.equal(result.payoutsSettled, 2);
  assert.deepEqual(calls.slice(0, 6), [
    "start:a",
    "end:a",
    "start:b",
    "end:b",
    "start:c",
    "end:c",
  ]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /stuck payout check failed b /);
});

test("duplicate, ignored and unknown count as still pending; ignored and errors log once each", async () => {
  const { deps } = fakes({
    payouts: ["dup", "ign", "unk"],
    results: { dup: "duplicate", ign: "ignored", unk: "unknown" },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsStillPending, 3);
  assert.equal(result.payoutsSettled, 0);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /ignored ign$/);
});

test("getBalanceKobo failing records nothing, flags the error and payouts still run first", async () => {
  const { deps, calls, state } = fakes({
    payouts: ["a"],
    results: { a: "paid" },
    balance: new PaystackError("Paystack unreachable", 503),
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsSettled, 1);
  assert.equal(result.reconciliation, null);
  assert.equal(result.reconciliationError, true);
  assert.deepEqual(state.recorded, []);
  assert.equal(calls.includes("record"), false);
  assert.equal(calls.indexOf("end:a") < calls.indexOf("balance"), true);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /PaystackError/);
  assert.match(logged[0], /503/);
});

test("recordReconciliation failing gives the same answer", async () => {
  const { deps } = fakes({
    payouts: ["a"],
    results: { a: "failed" },
    recordFails: new Error("reconciliation failed (XX000)"),
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsSettled, 1);
  assert.equal(result.reconciliation, null);
  assert.equal(result.reconciliationError, true);
});

test("the balance goes in and the difference comes out unchanged", async () => {
  const { deps, state } = fakes({ balance: 123_456_789 });
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(state.recorded, [123_456_789]);
  assert.deepEqual(result.reconciliation, RECON);
});

test("a failed stuck-payout lookup sets payoutsLookupError and reconciliation still runs", async () => {
  const { deps, state } = fakes();
  deps.listProcessingPayoutsOlderThan = async () => {
    throw new Error("stuck payouts lookup failed (XX000)");
  };
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsLookupError, true);
  assert.equal(result.payoutsChecked, 0);
  assert.equal(result.payoutsErrored, 0);
  assert.deepEqual(result.reconciliation, RECON);
  assert.deepEqual(state.recorded, [5_000_250]);
  assert.equal(logged.length, 1);
});

test("cronStatus is 200 only when every step worked", () => {
  const ok: MoneyChecksResult = {
    payoutsChecked: 2,
    payoutsSettled: 1,
    payoutsStillPending: 1,
    payoutsErrored: 0,
    payoutsLookupError: false,
    cardPaymentsChecked: 0,
    cardPaymentsFunded: 0,
    cardPaymentsErrored: 0,
    cardPaymentsLookupError: false,
    reconciliation: RECON,
    reconciliationError: false,
    reconciliations: [{ provider: "paystack", ok: true }],
  };
  assert.equal(cronStatus(ok), 200);
  assert.equal(cronStatus({ ...ok, payoutsLookupError: true }), 500);
  assert.equal(
    cronStatus({ ...ok, reconciliationError: true, reconciliation: null }),
    500,
  );
  assert.equal(cronStatus({ ...ok, payoutsErrored: 1 }), 500);
});

test("logs carry references and error classes, never messages that may hold secrets", async () => {
  const { deps } = fakes({
    payouts: ["pit_po_ref1"],
    results: {
      pit_po_ref1: new PaystackError("Bearer sk_test_SECRETVALUE leaked", 401),
    },
    balance: new PaystackError("sk_test_SECRETVALUE", 401),
  });
  await runMoneyChecks(NOW, deps);
  const text = logged.join("\n");
  assert.match(text, /pit_po_ref1/);
  assert.equal(text.includes("sk_test"), false);
  assert.equal(text.includes("SECRETVALUE"), false);
  assert.equal(text.includes("Bearer"), false);
});

// Cray ------------------------------------------------------------------------------------------

test("with only Paystack configured, Cray is never called", async () => {
  const { deps, calls } = fakes({ payouts: ["a"], results: { a: "paid" } });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.cardPaymentsChecked, 0);
  assert.deepEqual(result.reconciliations, [
    { provider: "paystack", ok: true },
  ]);
  assert.equal(
    calls.some((c) => c.startsWith("cray") || c.startsWith("card")),
    false,
  );
});

test("a Cray card payment still initiated is confirmed, within a 10 minute to 7 day window", async () => {
  const { deps, calls, state } = fakes({
    crayConfigured: true,
    cardPayments: ["pit_a", "pit_b", "pit_c"],
    cardResults: { pit_a: "funded", pit_b: "pending", pit_c: "stranded" },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("card:")),
    ["card:pit_a", "card:pit_b", "card:pit_c"],
  );
  assert.equal(result.cardPaymentsChecked, 3);
  assert.equal(result.cardPaymentsFunded, 2);
  assert.equal(result.cardPaymentsErrored, 0);
  assert.equal(
    state.cardWindow?.olderThan.toISOString(),
    "2026-11-13T03:20:00.000Z",
  );
  assert.equal(
    state.cardWindow?.newerThan.toISOString(),
    "2026-11-06T03:30:00.000Z",
  );
  assert.equal(state.cardWindow?.limit, 200);
});

test("one card payment failing to confirm does not stop the rest and fails the run", async () => {
  const { deps, calls } = fakes({
    crayConfigured: true,
    cardPayments: ["pit_a", "pit_b"],
    cardResults: {
      pit_a: new CrayError("Could not reach Cray", 0),
      pit_b: "funded",
    },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.cardPaymentsErrored, 1);
  assert.equal(result.cardPaymentsFunded, 1);
  assert.equal(calls.includes("card:pit_b"), true);
  assert.equal(cronStatus(result), 500);
  assert.match(
    logged.join("\n"),
    /cray card payment check failed pit_a CrayError 0/,
  );
});

test("every processing Cray payout is checked, however old", async () => {
  const { deps, calls } = fakes({
    crayConfigured: true,
    crayPayouts: ["pit_po_c1", "pit_po_c2", "pit_po_c3"],
    results: {
      pit_po_c1: "paid",
      pit_po_c2: "sent",
      pit_po_c3: "waiting_for_funds",
    },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("start:")),
    ["start:pit_po_c1", "start:pit_po_c2", "start:pit_po_c3"],
  );
  assert.equal(result.payoutsChecked, 3);
  assert.equal(result.payoutsSettled, 1);
  assert.equal(result.payoutsStillPending, 2);
});

test("a Cray payout that needs a person is logged for an admin and never counted settled", async () => {
  const { deps } = fakes({
    crayConfigured: true,
    crayPayouts: ["pit_po_c1", "pit_po_c2"],
    results: { pit_po_c1: "needs_reference", pit_po_c2: "name_changed" },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.equal(result.payoutsSettled, 0);
  assert.equal(result.payoutsStillPending, 2);
  assert.match(
    logged.join("\n"),
    /payout needs attention pit_po_c1 needs_reference/,
  );
  assert.match(
    logged.join("\n"),
    /payout needs attention pit_po_c2 name_changed/,
  );
});

test("a reversed Cray payout counts as settled", async () => {
  const { deps } = fakes({
    crayConfigured: true,
    crayPayouts: ["pit_po_c1"],
    results: { pit_po_c1: "reversed" },
  });
  assert.equal((await runMoneyChecks(NOW, deps)).payoutsSettled, 1);
});

test("each configured provider gets its own reconciliation run, with Cray's balance parts", async () => {
  const { deps, state } = fakes({
    crayConfigured: true,
    crayBalances: {
      totalKobo: 5_120_000,
      parts: [
        { name: "Main Balance", kobo: 5_000_000 },
        { name: "Settlement Balance", kobo: 120_000 },
      ],
    },
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(state.recorded, [5_000_250]);
  assert.deepEqual(state.crayRecorded, [
    {
      balance: 5_120_000,
      parts: [
        { name: "Main Balance", kobo: 5_000_000 },
        { name: "Settlement Balance", kobo: 120_000 },
      ],
    },
  ]);
  assert.deepEqual(result.reconciliations, [
    { provider: "paystack", ok: true },
    { provider: "cray", ok: true },
  ]);
});

test("one provider's balance failing does not stop the other's run, and fails the cron", async () => {
  const { deps, state } = fakes({
    crayConfigured: true,
    crayBalances: new CrayError("Could not reach Cray", 0),
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(state.recorded, [5_000_250]);
  assert.deepEqual(state.crayRecorded, []);
  assert.deepEqual(result.reconciliations, [
    { provider: "paystack", ok: true },
    { provider: "cray", ok: false },
  ]);
  assert.equal(cronStatus(result), 500);
  assert.match(logged.join("\n"), /cray reconciliation failed CrayError 0/);

  const other = fakes({
    crayConfigured: true,
    balance: new PaystackError("Paystack unreachable", 503),
  });
  const second = await runMoneyChecks(NOW, other.deps);
  assert.deepEqual(other.state.crayRecorded.length, 1);
  assert.deepEqual(second.reconciliations, [
    { provider: "paystack", ok: false },
    { provider: "cray", ok: true },
  ]);
});

test("a provider that isn't configured is not reconciled", async () => {
  const { deps, state } = fakes({
    paystackConfigured: false,
    crayConfigured: true,
  });
  const result = await runMoneyChecks(NOW, deps);
  assert.deepEqual(state.recorded, []);
  assert.equal(state.crayRecorded.length, 1);
  assert.deepEqual(result.reconciliations, [{ provider: "cray", ok: true }]);
  assert.equal(result.reconciliation, null);
  assert.equal(result.reconciliationError, false);
});
