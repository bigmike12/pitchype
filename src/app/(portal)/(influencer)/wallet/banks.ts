// The two payout providers' bank lists and account checks behind one pair of
// plain functions for the wallet page and its actions. Which provider is the
// active one is decided by the caller (getActivePaymentProvider); a bank's
// code means something different to each (Cray uses 6-digit NIP codes,
// Paystack its own), so a code is only ever used with the provider it came
// from.

import { listBanks as listCrayBanks, validateAccount } from "@/lib/cray";
import type { PaymentProvider } from "@/lib/db/money";
import { listBanks as listPaystackBanks, resolveAccount } from "@/lib/paystack";

export async function banksFor(
  provider: PaymentProvider,
): Promise<{ code: string; name: string }[]> {
  return provider === "cray" ? listCrayBanks() : listPaystackBanks();
}

/** The name the bank holds for this account. Throws the provider's own error type when it can't say. */
export async function accountNameFor(
  provider: PaymentProvider,
  accountNumber: string,
  bankCode: string,
): Promise<string> {
  if (provider === "cray") {
    return (await validateAccount(accountNumber, bankCode)).accountName;
  }
  return (await resolveAccount(accountNumber, bankCode)).accountName;
}
