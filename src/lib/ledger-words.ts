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

function labelFor(eventType: string, account: string): string {
  const business = account === "business_wallet";
  const creator = account === "creator_wallet";
  if (!business && !creator) return "Wallet activity";
  switch (eventType) {
    case "payment_received":
      return "Payment received";
    case "hire_funded":
      return "Paid for a hire";
    case "hire_settled":
      return business ? "Refund for a hire" : "Payment for a job";
    case "payout_requested":
      return creator ? "Payout requested" : "Wallet activity";
    case "payout_rejected":
    case "payout_failed":
      return creator ? "Payout returned to your wallet" : "Wallet activity";
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
    label: labelFor(row.eventType, row.account),
    direction: into ? "in" : "out",
    walletAmountKobo: Math.abs(row.amountKobo),
  };
}
