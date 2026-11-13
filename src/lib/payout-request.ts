// Payout requests in plain words: reading the amount a creator types, what
// they'll receive after the transfer cost, and how each payout status reads.
// No framework imports, so node tests cover it and the client form can use it.

import { KOBO_PER_NAIRA, formatNaira } from "./money.ts";
import { MIN_PAYOUT_KOBO, transferFee } from "./fees.ts";
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
 * What the creator pays to send `amountKobo` to their bank, and what lands in
 * their account. Callers check the amount first; a fee that would take it all
 * is a bug to surface, not a number to show.
 */
export function payoutPreview(amountKobo: number): {
  feeKobo: number;
  receiveKobo: number;
} {
  const feeKobo = transferFee(amountKobo);
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
    default:
      return { label: "Status unknown", tone: "info", detail: null };
  }
}

/** The same statuses for admins, who read about the payout rather than being addressed as the creator. */
export function adminPayoutStatus(status: string): string {
  switch (status) {
    case "requested":
      return "Waiting for approval";
    case "processing":
      return "Sent to Paystack, waiting for the bank";
    case "paid":
      return "Paid";
    case "failed":
      return "Failed, money returned to the wallet";
    case "rejected":
      return "Rejected, money returned to the wallet";
    default:
      return "Status unknown";
  }
}

/**
 * What an admin reads after asking Paystack about a payout. Fixed words for
 * each outcome of confirmTransfer(); Paystack's own text is never shown.
 * `changed` says the payout moved to paid or failed, so the page refreshes.
 */
export function payoutCheckOutcome(result: TransferResult): {
  status: "success" | "error";
  message: string;
  changed: boolean;
} {
  switch (result) {
    case "paid":
      return {
        status: "success",
        message: "Paystack says it was sent. Marked paid.",
        changed: true,
      };
    case "failed":
      return {
        status: "success",
        message:
          "Paystack says it did not go through. The money is back in the creator’s wallet.",
        changed: true,
      };
    case "pending":
      return {
        status: "success",
        message: "Paystack hasn’t finished it yet.",
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
  }
}
