// The scheduled money checks (spec §3, §11 call 4, §12; Cray spec §5.2, §5.4,
// §5.6): confirm Cray card payments that never heard back, settle payouts
// that are stuck in `processing`, then record one reconciliation run per
// payment provider that is set up.
//
// Invariants:
//   - Safe to run twice or late: confirmCardPayment and confirmTransfer settle
//     through functions that are idempotent in the database, and a
//     reconciliation run is only a new append-only row.
//   - Card payments, payouts and providers are handled one at a time and one
//     failure never stops the rest.
//   - Cray card payments are polled because Cray's `payin` webhook is unsigned
//     and may be missed: any still `initiated` that are 10 minutes to 7 days
//     old (at most 200 a run). Paystack card payments rely on the webhook and
//     the return page, as before.
//   - Paystack payouts are checked once they have waited 15 minutes. Cray
//     payouts are checked whatever their age: a Cray payout is never failed
//     because it is old, only because Cray says so (payments.ts).
//   - If a provider's balance cannot be read, nothing is recorded for it: a
//     guessed balance would be a false reconciliation row, and rows can't be
//     deleted. The other provider's run still happens.
//   - Logs carry references and error classes only, never messages or bodies.
//
// No Supabase or fetch of its own: the database and the providers come in
// through `deps`, so node tests pass fakes without a mocking framework.

import {
  stuckPayoutCutoff,
  type CardPaymentResult,
  type TransferResult,
} from "./payments.ts";

type Reconciliation = {
  expectedCashKobo: number;
  differenceKobo: number;
  ledgerBalanced: boolean;
};

export type MoneyCheckDeps = {
  isPaystackConfigured: () => boolean;
  isCrayConfigured: () => boolean;
  /** Paystack payouts still processing that were approved before the cutoff. */
  listProcessingPayoutsOlderThan: (
    cutoff: Date,
  ) => Promise<{ id: string; reference: string }[]>;
  /** Every Cray payout still processing, however old. */
  listProcessingCrayPayouts: () => Promise<{ id: string; reference: string }[]>;
  listInitiatedCrayCardPayments: (
    olderThan: Date,
    newerThan: Date,
    limit: number,
  ) => Promise<{ reference: string }[]>;
  confirmCardPayment: (reference: string) => Promise<CardPaymentResult>;
  confirmTransfer: (reference: string) => Promise<TransferResult>;
  getBalanceKobo: () => Promise<number>;
  recordReconciliation: (balanceKobo: number) => Promise<Reconciliation>;
  getCrayBalances: () => Promise<{
    totalKobo: number;
    parts: { name: string; kobo: number }[];
  }>;
  recordCrayReconciliation: (
    balanceKobo: number,
    parts: { name: string; kobo: number }[],
  ) => Promise<Reconciliation>;
};

export type MoneyChecksResult = {
  payoutsChecked: number;
  payoutsSettled: number;
  payoutsStillPending: number;
  payoutsErrored: number;
  payoutsLookupError: boolean;
  cardPaymentsChecked: number;
  cardPaymentsFunded: number;
  cardPaymentsErrored: number;
  cardPaymentsLookupError: boolean;
  /** The Paystack run (null when Paystack isn't set up or its run failed). */
  reconciliation: Reconciliation | null;
  reconciliationError: boolean;
  /** One entry per provider that was reconciled, and whether it worked. */
  reconciliations: { provider: "paystack" | "cray"; ok: boolean }[];
};

// The real dependencies, in one place. The database modules are imported
// lazily because they load the Supabase clients, which node tests cannot.
async function realDeps(): Promise<MoneyCheckDeps> {
  const payments = await import("./payments.ts");
  const paystack = await import("./paystack.ts");
  const cray = await import("./cray.ts");
  const money = await import("./db/money.ts");
  const payouts = await import("./db/payouts.ts");
  return {
    isPaystackConfigured: () => (process.env.PAYSTACK_SECRET_KEY ?? "") !== "",
    isCrayConfigured: cray.isCrayConfigured,
    listProcessingPayoutsOlderThan: payouts.listProcessingPayoutsOlderThan,
    listProcessingCrayPayouts: () => payouts.listProcessingPayouts("cray"),
    listInitiatedCrayCardPayments: money.listInitiatedCrayCardPayments,
    confirmCardPayment: (reference) => payments.confirmCardPayment(reference),
    confirmTransfer: (reference) => payments.confirmTransfer(reference),
    getBalanceKobo: paystack.getBalanceKobo,
    recordReconciliation: (balanceKobo) =>
      money.recordReconciliation("paystack", balanceKobo),
    getCrayBalances: cray.getBalances,
    recordCrayReconciliation: (balanceKobo, parts) =>
      money.recordReconciliation("cray", balanceKobo, parts),
  };
}

/** The error's class (and HTTP status when it has one), nothing else. */
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "NonError";
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? `${name} ${status}` : name;
}

/** HTTP status for the cron response: 500 when any step failed, so the scheduler's log shows it. */
export function cronStatus(result: MoneyChecksResult): 200 | 500 {
  const failed =
    result.payoutsLookupError ||
    result.cardPaymentsLookupError ||
    result.reconciliationError ||
    result.payoutsErrored > 0 ||
    result.cardPaymentsErrored > 0 ||
    result.reconciliations.some((run) => !run.ok);
  return failed ? 500 : 200;
}

const TEN_MINUTES_MS = 10 * 60_000;
const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
const CARD_BATCH = 200;
// Results that mean a person has to look: the payout stays processing.
const NEEDS_A_PERSON = new Set(["needs_reference", "name_changed"]);

export async function runMoneyChecks(
  now: Date = new Date(),
  deps?: MoneyCheckDeps,
): Promise<MoneyChecksResult> {
  const d = deps ?? (await realDeps());
  const paystackOn = d.isPaystackConfigured();
  const crayOn = d.isCrayConfigured();
  const result: MoneyChecksResult = {
    payoutsChecked: 0,
    payoutsSettled: 0,
    payoutsStillPending: 0,
    payoutsErrored: 0,
    payoutsLookupError: false,
    cardPaymentsChecked: 0,
    cardPaymentsFunded: 0,
    cardPaymentsErrored: 0,
    cardPaymentsLookupError: false,
    reconciliation: null,
    reconciliationError: false,
    reconciliations: [],
  };

  // Cray card payments that never heard back (the unsigned webhook was missed).
  if (crayOn) {
    try {
      const waiting = await d.listInitiatedCrayCardPayments(
        new Date(now.getTime() - TEN_MINUTES_MS),
        new Date(now.getTime() - SEVEN_DAYS_MS),
        CARD_BATCH,
      );
      result.cardPaymentsChecked = waiting.length;
      for (const { reference } of waiting) {
        try {
          const outcome = await d.confirmCardPayment(reference);
          if (outcome === "funded" || outcome === "stranded") {
            result.cardPaymentsFunded += 1;
          }
        } catch (error) {
          result.cardPaymentsErrored += 1;
          console.error(
            "cray card payment check failed",
            reference,
            describeError(error),
          );
        }
      }
    } catch (error) {
      result.cardPaymentsLookupError = true;
      console.error("cray card payments lookup failed", describeError(error));
    }
  }

  // Payouts: Paystack's that have waited, and every one of Cray's.
  const lists: (() => Promise<{ id: string; reference: string }[]>)[] = [];
  if (paystackOn) {
    lists.push(() => d.listProcessingPayoutsOlderThan(stuckPayoutCutoff(now)));
  }
  if (crayOn) lists.push(() => d.listProcessingCrayPayouts());
  for (const list of lists) {
    try {
      const stuck = await list();
      result.payoutsChecked += stuck.length;
      for (const { reference } of stuck) {
        try {
          const outcome = await d.confirmTransfer(reference);
          if (
            outcome === "paid" ||
            outcome === "failed" ||
            outcome === "reversed"
          ) {
            result.payoutsSettled += 1;
          } else {
            result.payoutsStillPending += 1;
            if (outcome === "ignored") {
              console.error("stuck payout result ignored", reference);
            } else if (NEEDS_A_PERSON.has(outcome)) {
              console.error("payout needs attention", reference, outcome);
            }
          }
        } catch (error) {
          result.payoutsErrored += 1;
          console.error(
            "stuck payout check failed",
            reference,
            describeError(error),
          );
        }
      }
    } catch (error) {
      result.payoutsLookupError = true;
      console.error("stuck payouts lookup failed", describeError(error));
    }
  }

  // One reconciliation per provider that is set up; one failing never stops the other.
  if (paystackOn) {
    try {
      result.reconciliation = await d.recordReconciliation(
        await d.getBalanceKobo(),
      );
      result.reconciliations.push({ provider: "paystack", ok: true });
    } catch (error) {
      result.reconciliationError = true;
      result.reconciliations.push({ provider: "paystack", ok: false });
      console.error("reconciliation failed", describeError(error));
    }
  }
  if (crayOn) {
    try {
      const balances = await d.getCrayBalances();
      await d.recordCrayReconciliation(balances.totalKobo, balances.parts);
      result.reconciliations.push({ provider: "cray", ok: true });
    } catch (error) {
      result.reconciliations.push({ provider: "cray", ok: false });
      console.error("cray reconciliation failed", describeError(error));
    }
  }

  return result;
}
