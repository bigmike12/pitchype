// The wallet history in plain words. The ledger stores a wallet as a
// liability, so money INTO a wallet is negative and money out is positive;
// people see it the other way round. No framework imports, so node tests
// cover it.

export type LedgerWords = {
  label: string;
  direction: "in" | "out";
  /** Always zero or more; `direction` carries the sign. */
  walletAmountKobo: number;
};

// A label is only used when the sign agrees with it (the ledger stores money
// into a wallet as negative). Any other combination is "Wallet activity", so
// the history never says the opposite of what happened.
function labelFor(
  eventType: string,
  account: string,
  amountKobo: number,
): string {
  const business = account === "business_wallet";
  const creator = account === "creator_wallet";
  if (!business && !creator) return "Wallet activity";
  const into = amountKobo < 0;
  switch (eventType) {
    case "payment_received":
      // A card payment that funds a hire with part of the wallet posts the
      // wallet part as money out; a stranded card payment lands in the wallet.
      if (into) return "Payment received";
      return business ? "Paid for a hire" : "Wallet activity";
    case "hire_funded":
      return business && !into ? "Paid for a hire" : "Wallet activity";
    case "hire_settled":
      if (!into) return "Wallet activity";
      return business ? "Refund for a hire" : "Payment for a job";
    case "payout_requested":
      return creator && !into ? "Payout requested" : "Wallet activity";
    case "payout_rejected":
    case "payout_failed":
      return creator && into
        ? "Payout returned to your wallet"
        : "Wallet activity";
    case "correction":
      return "Adjustment";
    default:
      return "Wallet activity";
  }
}

export function describeLedgerRow(row: {
  eventType: string;
  account: string;
  amountKobo: number;
}): LedgerWords {
  const into = row.amountKobo < 0;
  return {
    label: labelFor(row.eventType, row.account, row.amountKobo),
    direction: into ? "in" : "out",
    walletAmountKobo: Math.abs(row.amountKobo),
  };
}
