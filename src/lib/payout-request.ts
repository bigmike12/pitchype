// Payout requests in plain words: reading the amount a creator types, what
// they'll receive after the transfer cost, and how each payout status reads.
// No framework imports, so node tests cover it and the client form can use it.

import { KOBO_PER_NAIRA, formatNaira } from "./money.ts";
import { MIN_PAYOUT_KOBO, payoutTransferFee } from "./fees.ts";
import type { PaymentProvider } from "./db/money.ts";
import { providerName } from "./provider-words.ts";
import type { TransferResult } from "./payments.ts";

// Keeps the kobo total far inside what a number holds exactly.
const MAX_DIGITS = 12;

type Parsed = { ok: true; kobo: number } | { ok: false; error: string };

/**
 * Whole naira only, typed with or without thousands commas and a leading ₦.
 * The server parses again with this same function; the form only uses it to
 * show the preview.
 */
export function parsePayoutAmount(input: string): Parsed {
  const typed = input.trim().replace(/^₦\s*/, "");
  if (typed === "") return { ok: false, error: "Enter the amount in naira." };
  if (!/^\d[\d,]*$/.test(typed)) {
    return { ok: false, error: "Enter a whole number of naira, like 25,000." };
  }
  const digits = typed.replaceAll(",", "");
  if (digits.length > MAX_DIGITS) {
    return { ok: false, error: "That amount is too large." };
  }
  const kobo = Number(digits) * KOBO_PER_NAIRA;
  if (kobo < MIN_PAYOUT_KOBO) {
    return {
      ok: false,
      error: `The smallest payout is ${formatNaira(MIN_PAYOUT_KOBO)}.`,
    };
  }
  return { ok: true, kobo };
}

/**
 * Whether the name Cray's account check returns is still the name the creator
 * was shown, ignoring case and spacing. An empty name never matches.
 */
export function namesMatch(a: string, b: string): boolean {
  const clean = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLowerCase();
  return clean(a) !== "" && clean(a) === clean(b);
}

/**
 * What the creator pays to send `amountKobo` to their bank, and what lands in
 * their account. Callers check the amount first; a fee that would take it all
 * is a bug to surface, not a number to show.
 */
export function payoutPreview(
  amountKobo: number,
  provider: PaymentProvider = "paystack",
): {
  feeKobo: number;
  receiveKobo: number;
} {
  const feeKobo = payoutTransferFee(provider, amountKobo);
  if (feeKobo >= amountKobo) {
    throw new Error("The transfer cost would take the whole payout");
  }
  return { feeKobo, receiveKobo: amountKobo - feeKobo };
}

const BACK_IN_WALLET = "The money is back in your wallet.";

export function describePayoutStatus(p: {
  status: string;
  decisionReason: string | null;
}): {
  label: string;
  tone: "info" | "success" | "attention";
  detail: string | null;
} {
  switch (p.status) {
    case "requested":
      return {
        label: "Waiting for approval",
        tone: "info",
        detail: "A member of our team approves each payout before it is sent.",
      };
    case "processing":
      return {
        label: "Sent to your bank",
        tone: "info",
        detail: "It can take a few minutes to arrive.",
      };
    case "paid":
      return { label: "Paid", tone: "success", detail: null };
    case "failed":
      return {
        label: "Didn’t go through",
        tone: "attention",
        detail: BACK_IN_WALLET,
      };
    case "rejected":
      return {
        label: "Not approved",
        tone: "attention",
        detail: p.decisionReason
          ? `${p.decisionReason} ${BACK_IN_WALLET}`
          : BACK_IN_WALLET,
      };
    case "reversed":
      return {
        label: "Reversed",
        tone: "attention",
        detail: `It didn’t reach your bank, so it was sent back. ${BACK_IN_WALLET}`,
      };
    default:
      return { label: "Status unknown", tone: "info", detail: null };
  }
}

/** The same statuses for admins, who read about the payout rather than being addressed as the creator. */
export function adminPayoutStatus(
  status: string,
  provider: PaymentProvider = "paystack",
): string {
  const name = providerName(provider);
  switch (status) {
    case "requested":
      return "Waiting for approval";
    case "processing":
      return `Sent to ${name}, waiting for the bank`;
    case "paid":
      return "Paid";
    case "failed":
      return "Failed, money returned to the wallet";
    case "rejected":
      return "Rejected, money returned to the wallet";
    case "reversed":
      return `Reversed by ${name} after it was paid, money returned to the wallet`;
    default:
      return "Status unknown";
  }
}

/**
 * What an admin reads after asking Paystack about a payout. Fixed words for
 * each outcome of confirmTransfer(); Paystack's own text is never shown.
 * `changed` says the payout moved to paid or failed, so the page refreshes.
 */
export function payoutCheckOutcome(
  result: TransferResult,
  provider: PaymentProvider = "paystack",
): {
  status: "success" | "error";
  message: string;
  changed: boolean;
} {
  const name = providerName(provider);
  switch (result) {
    case "paid":
      return {
        status: "success",
        message: `${name} says it was sent. Marked paid.`,
        changed: true,
      };
    case "failed":
      return {
        status: "success",
        message: `${name} says it did not go through. The money is back in the creator’s wallet.`,
        changed: true,
      };
    case "reversed":
      return {
        status: "success",
        message: `${name} took this payout back. The money is back in the creator’s wallet.`,
        changed: true,
      };
    case "pending":
      return {
        status: "success",
        message: `${name} hasn’t finished it yet.`,
        changed: false,
      };
    case "duplicate":
    case "ignored":
      return {
        status: "success",
        message: "Already up to date.",
        changed: false,
      };
    case "unknown":
      return {
        status: "error",
        message: "Couldn’t find this transfer.",
        changed: false,
      };
    case "sent":
      return {
        status: "success",
        message: "Sent. It will be marked paid once the bank confirms it.",
        changed: true,
      };
    case "waiting_for_funds":
      return {
        status: "success",
        message:
          "Nothing was sent: the provider balance is too low for this payout yet. It will be tried again.",
        changed: true,
      };
    case "needs_reference":
      return {
        status: "error",
        message:
          "We can’t tell whether this was already sent. Find it in the provider’s dashboard and attach its reference here.",
        changed: true,
      };
    case "name_changed":
      return {
        status: "error",
        message:
          "The bank now returns a different account name, so nothing was sent. Reject the payout with a reason.",
        changed: false,
      };
  }
}
