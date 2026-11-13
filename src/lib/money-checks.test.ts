import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  cronStatus,
  runMoneyChecks,
  type MoneyChecksResult,
  type MoneyCheckDeps,
} from "./money-checks.ts";
import { stuckPayoutCutoff, type TransferResult } from "./payments.ts";
import { PaystackError } from "./paystack.ts";

const NOW = new Date("2026-11-13T03:30:00.000Z");
const RECON = { expectedCashKobo: 5_000_000, differenceKobo: -250, ledgerBalanced: true };

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
};

function fakes(script: Script = {}) {
  const calls: string[] = [];
  const state = { cutoff: null as Date | null, recorded: [] as number[] };
  const deps: MoneyCheckDeps = {
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
    reconciliation: RECON,
    reconciliationError: false,
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
    reconciliation: RECON,
    reconciliationError: false,
  };
  assert.equal(cronStatus(ok), 200);
  assert.equal(cronStatus({ ...ok, payoutsLookupError: true }), 500);
  assert.equal(cronStatus({ ...ok, reconciliationError: true, reconciliation: null }), 500);
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
