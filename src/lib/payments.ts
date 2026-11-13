// Where Paystack's word becomes money in our ledger: a verified card payment
// funds a hire (or is stranded into the business wallet), a verified transfer
// result settles a payout. Used by the Paystack webhook, the payment callback
// page and the stuck-payout poller.
//
// Invariants (CLAUDE.md §6 rules 4–6, spec §4 rules 3–4, §11 call 4):
//   - Paystack's verify endpoint is the only source of truth. The webhook body
//     and the browser give us a reference, nothing else.
//   - Idempotency lives in the database: record_card_payment and finish_payout
//     store the event key first and answer 'duplicate' on a repeat, so calling
//     these twice, or from the webhook and the callback at once, is safe.
//   - A payout is failed only when Paystack itself says failed or reversed, or
//     cannot find a transfer approved more than 15 minutes ago.
//   - Only a trimmed copy of Paystack's answer is stored: no customer,
//     authorization, card or bank details.
//
// No Supabase or fetch of its own: the database and Paystack come in through
// `deps`, so node tests pass fakes without a mocking framework.

import { MoneyStateError } from "./db/money-errors.ts";
import {
  PaystackError,
  isValidSignature,
  verifyTransaction,
  verifyTransfer,
} from "./paystack.ts";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CardDeps = {
  verifyTransaction: typeof verifyTransaction;
  recordCardPayment: (input: {
    reference: string;
    paidKobo: number;
    paystackFeeKobo: number;
    eventKey: string;
    payload: Json;
  }) => Promise<
    "funded" | "stranded" | "duplicate" | "mismatch" | "unknown_reference"
  >;
};

export type TransferDeps = {
  verifyTransfer: typeof verifyTransfer;
  getPayoutByReference: (
    reference: string,
  ) => Promise<{
    id: string;
    status: string;
    approvedAt: string | null;
  } | null>;
  finishPayout: (input: {
    reference: string;
    outcome: "paid" | "failed";
    eventKey: string;
    payload: Json;
  }) => Promise<"paid" | "failed" | "duplicate" | "ignored">;
  now: () => Date;
};

// The real dependencies, in one place. The database modules are imported
// lazily because they load the Supabase clients, which node tests cannot.
async function realDeps(): Promise<CardDeps & TransferDeps> {
  const money = await import("./db/money.ts");
  const payouts = await import("./db/payouts.ts");
  return {
    verifyTransaction,
    verifyTransfer,
    recordCardPayment: money.recordCardPayment,
    getPayoutByReference: payouts.getPayoutByReference,
    finishPayout: payouts.finishPayout,
    now: () => new Date(),
  };
}

/** Copies the named fields of Paystack's data object, plain values only. */
function trim(raw: unknown, keys: string[]): { [key: string]: Json } {
  const source =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const kept: { [key: string]: Json } = {};
  for (const key of keys) {
    const value = source[key];
    kept[key] =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : null;
  }
  return kept;
}

export type CardPaymentResult =
  | "funded"
  | "stranded"
  | "duplicate"
  | "mismatch"
  | "pending"
  | "failed"
  | "unknown"
  | "needs_review";

/**
 * Asks Paystack about a card payment and, if it succeeded, records it.
 * Throws when Paystack or the database can't be reached; the caller retries.
 */
export async function confirmCardPayment(
  reference: string,
  deps?: CardDeps,
): Promise<CardPaymentResult> {
  const d = deps ?? (await realDeps());
  const verified = await d.verifyTransaction(reference);
  if (verified.status === "pending") return "pending";
  if (verified.status === "failed" || verified.status === "abandoned") {
    return "failed";
  }
  // Every payment is started in naira; anything else is not ours to apply.
  if (verified.currency !== "NGN") return "mismatch";

  try {
    const result = await d.recordCardPayment({
      reference,
      paidKobo: verified.amountKobo,
      paystackFeeKobo: verified.feesKobo,
      eventKey: `charge.success:${reference}`,
      payload: trim(verified.raw, [
        "reference",
        "amount",
        "fees",
        "currency",
        "status",
        "channel",
        "paid_at",
        "id",
      ]),
    });
    return result === "unknown_reference" ? "unknown" : result;
  } catch (error) {
    if (error instanceof MoneyStateError) {
      console.error("card payment needs review", reference, error.code);
      return "needs_review";
    }
    throw error;
  }
}

/** 15 minutes before `now`: a transfer still unknown to Paystack after this is treated as never sent. */
export function stuckPayoutCutoff(now: Date): Date {
  return new Date(now.getTime() - 15 * 60_000);
}

export type TransferResult =
  "paid" | "failed" | "duplicate" | "ignored" | "pending" | "unknown";

/** Asks Paystack about a payout's transfer and settles the payout if Paystack has an answer. */
export async function confirmTransfer(
  reference: string,
  deps?: TransferDeps,
): Promise<TransferResult> {
  const d = deps ?? (await realDeps());
  const payout = await d.getPayoutByReference(reference);
  if (!payout) return "unknown";

  const verified = await d.verifyTransfer(reference);
  let outcome: "paid" | "failed";
  let eventKey: string;
  if (verified.status === "success") {
    outcome = "paid";
    eventKey = `transfer.success:${reference}`;
  } else if (verified.status === "failed" || verified.status === "reversed") {
    outcome = "failed";
    eventKey = `transfer.${verified.status}:${reference}`;
  } else if (verified.status === "not_found") {
    // Paystack never received it (we stopped between approval and sending).
    // Give an in-flight request time to land before re-crediting the wallet.
    const approvedAt =
      payout.approvedAt === null ? NaN : Date.parse(payout.approvedAt);
    const stuck = approvedAt < stuckPayoutCutoff(d.now()).getTime();
    if (!stuck) return "pending";
    outcome = "failed";
    eventKey = `transfer.not_found:${reference}`;
  } else {
    return "pending";
  }

  const result = await d.finishPayout({
    reference,
    outcome,
    eventKey,
    payload: trim(verified.raw, [
      "reference",
      "status",
      "amount",
      "transfer_code",
      "id",
      "transferred_at",
    ]),
  });
  if (result === "ignored") {
    // A result contradicting a final payout (e.g. reversed after paid). It
    // moves no money; the reconciliation difference shows it to an admin.
    console.error("payout event ignored", reference);
  }
  return result;
}

export type WebhookDeps = {
  confirmCardPayment: (reference: string) => Promise<CardPaymentResult>;
  confirmTransfer: (reference: string) => Promise<TransferResult>;
};

type WebhookResponse = {
  status: number;
  body: { ok: boolean; result?: string };
};

// The references we create (start_payment, approve_payout). Anything else is
// not ours, and is never sent on to Paystack.
const CARD_REFERENCE = /^pit_[0-9a-f]{32}$/;
const PAYOUT_REFERENCE = /^pit_po_[0-9a-f]{32}$/;
const TRANSFER_EVENTS = new Set([
  "transfer.success",
  "transfer.failed",
  "transfer.reversed",
]);

/**
 * Decides what a Paystack webhook means. The signature is checked on the raw
 * body before anything is parsed; then only the event name and the reference
 * are read, and the payment or transfer is verified with Paystack.
 *
 * 200 tells Paystack to stop; 5xx makes it retry. Retried: a Paystack or
 * database outage, and a charge Paystack still calls pending.
 */
export async function handlePaystackWebhook(
  rawBody: string,
  signature: string | null,
  deps: WebhookDeps = { confirmCardPayment, confirmTransfer },
): Promise<WebhookResponse> {
  if (!isValidSignature(rawBody, signature)) {
    return { status: 401, body: { ok: false } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }

  const event =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { event?: unknown }).event
      : undefined;
  const data =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { data?: unknown }).data
      : undefined;
  const reference =
    typeof data === "object" && data !== null
      ? (data as { reference?: unknown }).reference
      : undefined;
  if (typeof event !== "string" || typeof reference !== "string") {
    return { status: 200, body: { ok: true, result: "ignored" } };
  }

  try {
    if (event === "charge.success" && CARD_REFERENCE.test(reference)) {
      const result = await deps.confirmCardPayment(reference);
      // Paystack said success but its verify endpoint doesn't agree yet.
      if (result === "pending")
        return { status: 503, body: { ok: false, result } };
      return { status: 200, body: { ok: true, result } };
    }
    if (TRANSFER_EVENTS.has(event) && PAYOUT_REFERENCE.test(reference)) {
      // Pending is acknowledged: the stuck-payout poller asks again later.
      const result = await deps.confirmTransfer(reference);
      return { status: 200, body: { ok: true, result } };
    }
    return { status: 200, body: { ok: true, result: "ignored" } };
  } catch (error) {
    if (
      error instanceof PaystackError &&
      error.status >= 400 &&
      error.status < 500
    ) {
      // Paystack refused the lookup itself (e.g. a test-mode reference sent to
      // live keys); retrying would get the same answer.
      console.error(
        "paystack webhook: verify refused",
        event,
        reference,
        error.status,
      );
      return { status: 200, body: { ok: true, result: "not_verified" } };
    }
    console.error(
      "paystack webhook failed",
      event,
      reference,
      error instanceof PaystackError ? `paystack ${error.status}` : "error",
    );
    return { status: 500, body: { ok: false } };
  }
}
