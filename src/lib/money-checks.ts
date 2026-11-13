// The scheduled money checks (spec §3, §11 call 4, §12): settle payouts that
// are stuck in `processing`, then record a reconciliation run against
// Paystack's balance.
//
// Invariants:
//   - Safe to run twice or late: confirmTransfer settles through
//     finish_payout, which is idempotent, and a reconciliation run is only a
//     new append-only row.
//   - Stuck payouts are confirmed one at a time and one failure never stops
//     the rest.
//   - If Paystack's balance cannot be read, nothing is recorded: a guessed
//     balance would be a false reconciliation row, and rows can't be deleted.
//   - Logs carry references and error classes only, never messages or bodies.
//
// No Supabase or fetch of its own: the database and Paystack come in through
// `deps`, so node tests pass fakes without a mocking framework.

import { stuckPayoutCutoff, type TransferResult } from "./payments.ts";

export type MoneyCheckDeps = {
  listProcessingPayoutsOlderThan: (
    cutoff: Date,
  ) => Promise<{ id: string; reference: string }[]>;
  confirmTransfer: (reference: string) => Promise<TransferResult>;
  getBalanceKobo: () => Promise<number>;
  recordReconciliation: (balanceKobo: number) => Promise<{
    expectedCashKobo: number;
    differenceKobo: number;
    ledgerBalanced: boolean;
  }>;
};

export type MoneyChecksResult = {
  payoutsChecked: number;
  payoutsSettled: number;
  payoutsStillPending: number;
  payoutsErrored: number;
  payoutsLookupError: boolean;
  reconciliation: {
    expectedCashKobo: number;
    differenceKobo: number;
    ledgerBalanced: boolean;
  } | null;
  reconciliationError: boolean;
};

// The real dependencies, in one place. The database modules are imported
// lazily because they load the Supabase clients, which node tests cannot.
async function realDeps(): Promise<MoneyCheckDeps> {
  const payments = await import("./payments.ts");
  const paystack = await import("./paystack.ts");
  const money = await import("./db/money.ts");
  const payouts = await import("./db/payouts.ts");
  return {
    listProcessingPayoutsOlderThan: payouts.listProcessingPayoutsOlderThan,
    confirmTransfer: (reference) => payments.confirmTransfer(reference),
    getBalanceKobo: paystack.getBalanceKobo,
    recordReconciliation: money.recordReconciliation,
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
    result.reconciliationError ||
    result.payoutsErrored > 0;
  return failed ? 500 : 200;
}

export async function runMoneyChecks(
  now: Date = new Date(),
  deps?: MoneyCheckDeps,
): Promise<MoneyChecksResult> {
  const d = deps ?? (await realDeps());
  const result: MoneyChecksResult = {
    payoutsChecked: 0,
    payoutsSettled: 0,
    payoutsStillPending: 0,
    payoutsErrored: 0,
    payoutsLookupError: false,
    reconciliation: null,
    reconciliationError: false,
  };

  try {
    const stuck = await d.listProcessingPayoutsOlderThan(stuckPayoutCutoff(now));
    result.payoutsChecked = stuck.length;
    for (const { reference } of stuck) {
      try {
        const outcome = await d.confirmTransfer(reference);
        if (outcome === "paid" || outcome === "failed") {
          result.payoutsSettled += 1;
        } else {
          result.payoutsStillPending += 1;
          if (outcome === "ignored") {
            console.error("stuck payout result ignored", reference);
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

  try {
    result.reconciliation = await d.recordReconciliation(
      await d.getBalanceKobo(),
    );
  } catch (error) {
    result.reconciliationError = true;
    console.error("reconciliation failed", describeError(error));
  }

  return result;
}
