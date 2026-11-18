"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { requestPayout, saveBankAccount } from "@/lib/db/payouts";
import { text, type FormState } from "@/lib/form-data";
import {
  createTransferRecipient,
  listBanks,
  PaystackError,
  resolveAccount,
} from "@/lib/paystack";
import {
  BANK_CHECK_LIMITED_MESSAGE,
  isBankCheckLimited,
  isPayoutLimited,
  PAYOUT_LIMITED_MESSAGE,
} from "@/lib/money-limits";
import { parsePayoutAmount } from "@/lib/payout-request";
import { refusalText } from "@/lib/refusals";

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

type BankDetails =
  | { ok: true; bankCode: string; bankName: string; accountNumber: string }
  | { ok: false; state: BankState };

/**
 * Reads and checks the bank fields. The bank's NAME comes from Paystack's
 * list, looked up by the submitted code, so a made-up name can't be stored.
 */
async function readBankDetails(form: FormData): Promise<BankDetails> {
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
    banks = await listBanks();
  } catch (error) {
    if (!(error instanceof PaystackError)) throw error;
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
 * Step one: ask Paystack whose account this is, so the creator can confirm
 * it's theirs before anything is saved.
 */
export async function checkBankAccountAction(
  _previous: BankState,
  form: FormData,
): Promise<BankState> {
  const user = await requireRole("influencer");
  if (await isBankCheckLimited(user.id)) {
    return { status: "error", message: BANK_CHECK_LIMITED_MESSAGE };
  }
  try {
    const details = await readBankDetails(form);
    if (!details.ok) return details.state;
    const { accountName } = await resolveAccount(
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
    if (error instanceof PaystackError) {
      return { status: "error", message: COULDNT_CHECK };
    }
    throw error;
  }
}

/**
 * Step two: check everything again and ask Paystack again, then save. The
 * name is whatever Paystack says now, not anything the browser sent. Only the
 * last four digits are stored; the recipient code stays on the server.
 */
export async function saveBankAccountAction(
  _previous: BankState,
  form: FormData,
): Promise<BankState> {
  const user = await requireRole("influencer");
  if (await isBankCheckLimited(user.id)) {
    return { status: "error", message: BANK_CHECK_LIMITED_MESSAGE };
  }
  try {
    const details = await readBankDetails(form);
    if (!details.ok) return details.state;
    const { accountName } = await resolveAccount(
      details.accountNumber,
      details.bankCode,
    );
    const { recipientCode } = await createTransferRecipient({
      name: accountName,
      accountNumber: details.accountNumber,
      bankCode: details.bankCode,
    });
    await saveBankAccount({
      userId: user.id,
      bankCode: details.bankCode,
      bankName: details.bankName,
      last4: details.accountNumber.slice(-4),
      accountName,
      recipientCode,
    });
  } catch (error) {
    if (error instanceof PaystackError) {
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
