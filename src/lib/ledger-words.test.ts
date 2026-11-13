import assert from "node:assert/strict";
import { test } from "node:test";

import { describeLedgerRow } from "./ledger-words.ts";

const row = (eventType: string, account: string, amountKobo: number) =>
  describeLedgerRow({ eventType, account, amountKobo });

test("money into a wallet is stored negative and shown as coming in", () => {
  assert.deepEqual(row("hire_settled", "business_wallet", -5_000_000), {
    label: "Refund for a hire",
    direction: "in",
    walletAmountKobo: 5_000_000,
  });
  assert.deepEqual(row("hire_settled", "creator_wallet", -4_750_000), {
    label: "Payment for a job",
    direction: "in",
    walletAmountKobo: 4_750_000,
  });
});

test("money out of a wallet is stored positive and shown as going out", () => {
  assert.deepEqual(row("hire_funded", "business_wallet", 2_000_000), {
    label: "Paid for a hire",
    direction: "out",
    walletAmountKobo: 2_000_000,
  });
  assert.deepEqual(row("payout_requested", "creator_wallet", 1_500_000), {
    label: "Payout requested",
    direction: "out",
    walletAmountKobo: 1_500_000,
  });
});

test("every known event has its words", () => {
  assert.equal(
    row("payment_received", "business_wallet", -100).label,
    "Payment received",
  );
  assert.equal(
    row("payment_received", "creator_wallet", -100).label,
    "Payment received",
  );
  assert.equal(
    row("payout_rejected", "creator_wallet", -100).label,
    "Payout returned to your wallet",
  );
  assert.equal(
    row("payout_failed", "creator_wallet", -100).label,
    "Payout returned to your wallet",
  );
  assert.equal(row("correction", "business_wallet", -100).label, "Adjustment");
  assert.equal(row("correction", "creator_wallet", 100).label, "Adjustment");
});

test("an unknown event, or a known one on an unexpected account, is plain wallet activity", () => {
  assert.equal(
    row("something_new", "creator_wallet", -100).label,
    "Wallet activity",
  );
  assert.equal(
    row("hire_settled", "escrow", -100).label,
    "Wallet activity",
  );
  assert.equal(
    row("payout_requested", "business_wallet", 100).label,
    "Wallet activity",
  );
});

test("the wallet amount is never negative", () => {
  for (const amount of [-5, -1, 0, 1, 5_000_000, -5_000_000]) {
    assert.ok(row("hire_funded", "business_wallet", amount).walletAmountKobo >= 0);
    assert.ok(row("nope", "creator_wallet", amount).walletAmountKobo >= 0);
  }
});

test("a zero amount counts as out and stays zero", () => {
  assert.deepEqual(row("correction", "business_wallet", 0), {
    label: "Adjustment",
    direction: "out",
    walletAmountKobo: 0,
  });
});
