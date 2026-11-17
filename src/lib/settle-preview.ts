// What an admin's settlement does to each side's money, worked out before they
// confirm. This mirrors settle_money() in the settlement migration (the
// database does the real maths from the hire's own fee snapshot); the page
// shows these numbers so nobody confirms blind. No framework imports, so node
// tests cover it.

import type { SettleOutcome } from "./db/money.ts";
import { creatorFee, faultRefund } from "./fees.ts";
import { KOBO_PER_NAIRA, formatNaira } from "./money.ts";

export const SETTLE_OUTCOMES: { value: SettleOutcome; label: string }[] = [
  { value: "release", label: "Release in full to the creator" },
  { value: "refund", label: "Refund in full to the business" },
  { value: "split", label: "Split: release part, refund the rest" },
  { value: "refund_creator_fault", label: "Refund: creator at fault" },
];

export function isSettleOutcome(value: string): value is SettleOutcome {
  return SETTLE_OUTCOMES.some((o) => o.value === value);
}

// Keeps the kobo total far inside what a number holds exactly.
const MAX_DIGITS = 12;

/** Whole naira, typed with or without commas and a leading ₦. At least ₦1. */
export function parseNairaAmount(
  input: string,
): { ok: true; kobo: number } | { ok: false; error: string } {
  const typed = input.trim().replace(/^₦\s*/, "");
  if (typed === "") return { ok: false, error: "Enter the amount in naira." };
  if (!/^\d[\d,]*$/.test(typed)) {
    return { ok: false, error: "Enter a whole number of naira, like 20,000." };
  }
  const digits = typed.replaceAll(",", "");
  if (digits.length > MAX_DIGITS) {
    return { ok: false, error: "That amount is too large." };
  }
  const kobo = Number(digits) * KOBO_PER_NAIRA;
  if (kobo < KOBO_PER_NAIRA) {
    return { ok: false, error: "Enter at least ₦1." };
  }
  return { ok: true, kobo };
}

export type SettlePreview =
  | {
      ok: true;
      creatorGetsKobo: number;
      creatorFeeKobo: number;
      businessGetsBackKobo: number;
      /** All of Pitchype's revenue on this hire once it is settled. */
      platformKeepsKobo: number;
      warning: string | null;
    }
  | { ok: false; error: string };

export function settlePreview(input: {
  outcome: SettleOutcome;
  agreedPriceKobo: number;
  /** The amount to release; used by "split" only. */
  releaseKobo: number | null;
  businessFeeKobo: number;
  creatorFeeBps: number;
  creatorMinFeeKobo: number;
  /**
   * What Paystack charged for the payment that funded this hire (0 when it
   * was paid from the wallet); null when that payment can't be found.
   */
  paystackChargeKobo: number | null;
}): SettlePreview {
  const price = input.agreedPriceKobo;

  let releasedKobo: number;
  switch (input.outcome) {
    case "release":
      releasedKobo = price;
      break;
    case "refund":
    case "refund_creator_fault":
      releasedKobo = 0;
      break;
    case "split": {
      const r = input.releaseKobo;
      if (r === null || !Number.isInteger(r) || r % KOBO_PER_NAIRA !== 0) {
        return { ok: false, error: "Release a whole number of naira." };
      }
      if (r <= 0 || r >= price) {
        return {
          ok: false,
          error:
            "A split releases part of the price. Use release or refund in full for the rest.",
        };
      }
      releasedKobo = r;
      break;
    }
  }

  const feeKobo = creatorFee(
    releasedKobo,
    input.creatorFeeBps,
    input.creatorMinFeeKobo,
  );
  const creatorGetsKobo = releasedKobo - feeKobo;

  const fault = input.outcome === "refund_creator_fault";
  const businessGetsBackKobo = fault
    ? faultRefund(price, input.businessFeeKobo, input.paystackChargeKobo ?? 0)
    : price - releasedKobo;
  // Whatever of the business fee is not handed back stays with Pitchype
  // (on a fault refund that is only the card charge Paystack kept).
  const businessFeeKeptKobo = fault
    ? input.businessFeeKobo - (businessGetsBackKobo - price)
    : input.businessFeeKobo;

  let warning: string | null = null;
  if (releasedKobo > 0 && creatorGetsKobo === 0) {
    warning = "The creator would receive nothing after the fee.";
  } else if (fault && input.paystackChargeKobo === null) {
    warning =
      "The payment that funded this hire couldn’t be found, so its card charge is left out of the refund shown. The exact refund is worked out when you confirm.";
  }

  return {
    ok: true,
    creatorGetsKobo,
    creatorFeeKobo: feeKobo,
    businessGetsBackKobo,
    platformKeepsKobo: businessFeeKeptKobo + feeKobo,
    warning,
  };
}

/** A hire's fee snapshot and price: what the preview line is worked from. */
export type SettleFacts = {
  agreedPriceKobo: number;
  businessFeeKobo: number;
  creatorFeeBps: number;
  creatorMinFeeKobo: number;
  /** The funding payment's charge; null if that payment can't be found. */
  paystackChargeKobo: number | null;
};

/**
 * What a settlement form shows under its fields while an admin fills it in:
 * the one-line result for what is chosen so far, a problem with the typed
 * amount (not while it is still empty), and a warning from the preview. Used
 * by the escrow settle form and the dispute decision form, so both say the
 * same thing. The server checks every input again.
 */
export function describeSettlePreview(
  outcome: string,
  amountText: string,
  facts: SettleFacts,
): { line: string | null; problem: string | null; warning: string | null } {
  if (!isSettleOutcome(outcome)) {
    return { line: null, problem: null, warning: null };
  }
  const typed = outcome === "split" ? parseNairaAmount(amountText) : null;
  if (typed && !typed.ok) {
    return {
      line: null,
      problem: amountText.trim() === "" ? null : typed.error,
      warning: null,
    };
  }
  const preview = settlePreview({
    outcome,
    ...facts,
    releaseKobo: typed?.ok ? typed.kobo : null,
  });
  if (!preview.ok) {
    return {
      line: null,
      problem: typed ? preview.error : null,
      warning: null,
    };
  }
  return {
    line: `Creator receives ${formatNaira(preview.creatorGetsKobo)} after their ${formatNaira(preview.creatorFeeKobo)} fee · Business gets back ${formatNaira(preview.businessGetsBackKobo)} · Pitchype keeps ${formatNaira(preview.platformKeepsKobo)}`,
    problem: null,
    warning: preview.warning,
  };
}
