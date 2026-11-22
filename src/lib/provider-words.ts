// Names and one-line explanations for the admin money pages. Users never see
// a provider's name (they read "our payment provider"); admins do, because
// they act on a specific provider's dashboard and balance.
// No framework imports, so node tests cover it.

import type { PaymentProvider } from "./db/money.ts";

export function providerName(provider: PaymentProvider): string {
  return provider === "cray" ? "Cray" : "Paystack";
}

/** What a Cray payout's flag means, in one line, for the admin payouts page. */
export function payoutFlagWords(flags: {
  waitingForFunds: boolean;
  needsReference: boolean;
}): string | null {
  if (flags.needsReference) {
    return "Cray rejected our reference as already used, so this payout may already have gone out. Nothing is failed or re-credited. Find it in Cray’s dashboard and attach Cray’s reference.";
  }
  if (flags.waitingForFunds) {
    return "Nothing was sent: Cray’s Main Balance is too low for this payout. It is tried again automatically, or press Check with Cray.";
  }
  return null;
}
