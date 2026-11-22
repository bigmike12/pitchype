"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { AccountCryptoError, encryptAccountNumber } from "@/lib/account-crypto";
import { requireRole } from "@/lib/auth";
import { CrayError } from "@/lib/cray";
import { getActivePaymentProvider, type PaymentProvider } from "@/lib/db/money";
import {
  requestPayout,
  saveBankAccount,
  saveCrayBankAccount,
} from "@/lib/db/payouts";
import { text, type FormState } from "@/lib/form-data";
import { createTransferRecipient, PaystackError } from "@/lib/paystack";
import {
  BANK_CHECK_LIMITED_MESSAGE,
  isBankCheckLimited,
  isPayoutLimited,
  PAYOUT_LIMITED_MESSAGE,
} from "@/lib/money-limits";
import { parsePayoutAmount } from "@/lib/payout-request";
import { refusalText } from "@/lib/refusals";

import { accountNameFor, banksFor } from "./banks";

// Bank account ---------------------------------------------------------------

/**
 * Step one returns the name Paystack found (and the bank and last four
 * digits), never the full account number: the form keeps what was typed.
 */
export type BankState = {
  status: "idle" | "error" | "success";
  message?: string;
  step?: "confirm";
  accountName?: string;
  bankName?: string;
  last4?: string;
};

const COULDNT_CHECK =
  "We couldn’t check that account. Please check the number and bank and try again.";

const BANKS_UNAVAILABLE =
  "We couldn’t reach the bank list. Please try again shortly.";

// Anything a provider (or our own encryption) can throw that is not a bug in
// this code: shown to the creator as "couldn't check", never in the
// provider's own words.
function isProviderError(error: unknown): boolean {
  return (
    error instanceof PaystackError ||
    error instanceof CrayError ||
    error instanceof AccountCryptoError
  );
}

type BankDetails =
  | { ok: true; bankCode: string; bankName: string; accountNumber: string }
  | { ok: false; state: BankState };

/**
 * Reads and checks the bank fields. The bank's NAME comes from the active
 * provider's list, looked up by the submitted code, so a made-up name can't be
 * stored.
 */
async function readBankDetails(
  form: FormData,
  provider: PaymentProvider,
): Promise<BankDetails> {
  const bankCode = text(form, "bankCode");
  const accountNumber = text(form, "accountNumber").trim();
  if (!/^\d{10}$/.test(accountNumber)) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "An account number has 10 digits.",
      },
    };
  }
  let banks: { code: string; name: string }[];
  try {
    banks = await banksFor(provider);
  } catch (error) {
    if (!isProviderError(error)) throw error;
    return {
      ok: false,
      state: { status: "error", message: BANKS_UNAVAILABLE },
    };
  }
  const bank = banks.find((b) => b.code === bankCode);
  if (!bank) {
    return {
      ok: false,
      state: { status: "error", message: "Choose your bank from the list." },
    };
  }
  return { ok: true, bankCode, bankName: bank.name, accountNumber };
}

/**
 * Step one: ask the active provider whose account this is, so the creator can
 * confirm it's theirs before anything is saved.
 */
export async function checkBankAccountAction(
  _previous: BankState,
  form: FormData,
): Promise<BankState> {
  const user = await requireRole("influencer");
  if (await isBankCheckLimited(user.id)) {
    return { status: "error", message: BANK_CHECK_LIMITED_MESSAGE };
  }
  const provider = await getActivePaymentProvider();
  try {
    const details = await readBankDetails(form, provider);
    if (!details.ok) return details.state;
    const accountName = await accountNameFor(
      provider,
      details.accountNumber,
      details.bankCode,
    );
    return {
      status: "idle",
      step: "confirm",
      accountName,
      bankName: details.bankName,
      last4: details.accountNumber.slice(-4),
    };
  } catch (error) {
    if (isProviderError(error)) {
      return { status: "error", message: COULDNT_CHECK };
    }
    throw error;
  }
}

/**
 * Step two: check everything again and ask the provider again, then save. The
 * name is whatever the provider says now, not anything the browser sent. Only
 * the last four digits are shown or logged; a Cray account's full number is
 * stored encrypted (account-crypto.ts), a Paystack account keeps only a
 * recipient code on the server.
 */
export async function saveBankAccountAction(
  _previous: BankState,
  form: FormData,
): Promise<BankState> {
  const user = await requireRole("influencer");
  if (await isBankCheckLimited(user.id)) {
    return { status: "error", message: BANK_CHECK_LIMITED_MESSAGE };
  }
  const provider = await getActivePaymentProvider();
  try {
    const details = await readBankDetails(form, provider);
    if (!details.ok) return details.state;
    const accountName = await accountNameFor(
      provider,
      details.accountNumber,
      details.bankCode,
    );
    const last4 = details.accountNumber.slice(-4);
    if (provider === "cray") {
      await saveCrayBankAccount({
        userId: user.id,
        bankCode: details.bankCode,
        bankName: details.bankName,
        last4,
        accountName,
        accountNumberEncrypted: encryptAccountNumber(details.accountNumber),
      });
    } else {
      const { recipientCode } = await createTransferRecipient({
        name: accountName,
        accountNumber: details.accountNumber,
        bankCode: details.bankCode,
      });
      await saveBankAccount({
        userId: user.id,
        bankCode: details.bankCode,
        bankName: details.bankName,
        last4,
        accountName,
        recipientCode,
      });
    }
  } catch (error) {
    if (isProviderError(error)) {
      if (error instanceof AccountCryptoError) {
        // Our own setup (the encryption key), not the creator's mistake.
        console.error("bank account encryption failed");
      }
      return { status: "error", message: COULDNT_CHECK };
    }
    throw error;
  }
  // redirect() works by throwing, so it stays outside the try block. It also
  // drops "?bank=change" from the address.
  redirect("/wallet");
}

// Payouts --------------------------------------------------------------------

export type PayoutState = FormState<never>;

/**
 * Asks for a payout. The amount is read again here; the database checks the
 * bank account, the minimum, the balance and that the transfer cost leaves
 * something, and takes the money out of the wallet in the same step.
 */
export async function requestPayoutAction(
  _previous: PayoutState,
  form: FormData,
): Promise<PayoutState> {
  const user = await requireRole("influencer");
  if (await isPayoutLimited(user.id)) {
    return { status: "error", message: PAYOUT_LIMITED_MESSAGE };
  }
  const amount = parsePayoutAmount(text(form, "amount"));
  if (!amount.ok) return { status: "error", message: amount.error };

  const result = await requestPayout(amount.kobo);
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return {
    status: "success",
    message: "Payout requested. You can follow it in the list below.",
  };
}
