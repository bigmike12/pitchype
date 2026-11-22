// Where a provider's word becomes money in our ledger: a verified card payment
// funds a hire (or is stranded into the business wallet), a verified transfer
// result settles a payout. Used by the webhooks, the payment callback page and
// the money checks. Two providers, branched on what the payment or payout row
// says it started on (never on the current admin switch): Paystack and Cray.
//
// Invariants (CLAUDE.md §6 rules 4–6, spec §4 rules 3–4, §11 call 4):
//   - The provider's own lookup (Paystack verify, Cray checkout query and
//     payout requery) is the only source of truth. The webhook body and the
//     browser give us a reference, nothing else. (The one exception, a signed
//     Cray bank-transfer deposit, is handled in handleCrayWebhook.)
//   - Idempotency lives in the database: record_card_payment and finish_payout
//     store the event key first and answer 'duplicate' on a repeat, so calling
//     these twice, or from the webhook and the callback at once, is safe.
//   - A Paystack payout is failed only when Paystack itself says failed or
//     reversed, or cannot find a transfer approved more than 15 minutes ago. A
//     CRAY payout is never failed because Cray cannot be reached or does not
//     know it: only Cray's own requery saying failed (or reversed before we
//     recorded it paid) fails it, and a send that may have gone out is flagged
//     for an admin, never failed or re-credited.
//   - Only a trimmed copy of a provider's answer is stored: no customer,
//     authorization, card or bank details.
//
// No Supabase or fetch of its own: the database and Paystack come in through
// `deps`, so node tests pass fakes without a mocking framework.

import { MoneyStateError } from "./db/money-errors.ts";
import {
  CrayError,
  disburse,
  isValidWebhookHash,
  nairaToKobo,
  queryCheckout,
  requeryPayout,
  validateAccount,
} from "./cray.ts";
import {
  PaystackError,
  isValidSignature,
  verifyTransaction,
  verifyTransfer,
} from "./paystack.ts";
import { namesMatch } from "./payout-request.ts";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CardDeps = {
  /** Which provider a payment started on, and its frozen card part; null if no such payment. */
  getPaymentProvider: (reference: string) => Promise<{
    provider: "cray" | "paystack";
    cardPartKobo: number;
  } | null>;
  queryCheckout: typeof queryCheckout;
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

/** A payout as the money checks need it. The database module's PayoutToSend has this shape. */
export type PayoutRecord = {
  id: string;
  status: string;
  provider: "cray" | "paystack";
  reference: string | null;
  providerReference: string | null;
  approvedAt: string | null;
  /** What the bank receives: the amount less the creator's transfer fee. */
  sendKobo: number;
  /** Cray only: the snapshotted destination (the number encrypted). */
  bankCode: string | null;
  accountNumberEncrypted: string | null;
  accountName: string;
};

export type TransferDeps = {
  verifyTransfer: typeof verifyTransfer;
  requeryPayout: typeof requeryPayout;
  validateAccount: typeof validateAccount;
  disburse: typeof disburse;
  /** Decrypts a stored Cray account number; only the send path calls it. */
  decryptAccountNumber: (stored: string) => string;
  recordPayoutSend: (
    reference: string,
    providerReference: string,
  ) => Promise<"set" | "already_set" | "conflict">;
  flagPayout: (
    reference: string,
    flag: "waiting_for_funds" | "needs_reference",
  ) => Promise<void>;
  getPayoutByReference: (reference: string) => Promise<PayoutRecord | null>;
  finishPayout: (input: {
    reference: string;
    outcome: "paid" | "failed" | "reversed";
    eventKey: string;
    payload: Json;
    sentKobo?: number | null;
    chargeKobo?: number | null;
  }) => Promise<"paid" | "failed" | "reversed" | "duplicate" | "ignored">;
  now: () => Date;
};

// The real dependencies, in one place. The database modules are imported
// lazily because they load the Supabase clients, which node tests cannot.
async function realDeps(): Promise<CardDeps & TransferDeps> {
  const money = await import("./db/money.ts");
  const payouts = await import("./db/payouts.ts");
  const crypto = await import("./account-crypto.ts");
  return {
    getPaymentProvider: money.getPaymentProvider,
    queryCheckout,
    verifyTransaction,
    verifyTransfer,
    requeryPayout,
    validateAccount,
    disburse,
    decryptAccountNumber: crypto.decryptAccountNumber,
    recordPayoutSend: payouts.recordPayoutSend,
    flagPayout: payouts.flagPayout,
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
 * What a Cray hosted-checkout answer means for a payment's frozen card part.
 * Cray is asked to add its card charge on top (feeBearer: customer), so the
 * business pays `gross` = card part + charge and we receive `net` = card part,
 * and the processor charge on our side is 0. If Cray instead took its charge
 * out of what we receive (gross = card part), we bore it: record it, and log
 * so someone checks the checkout request. Anything else is a mismatch.
 */
export function crayCardFigures(
  query: { grossKobo: number; feeKobo: number; netKobo: number },
  cardPartKobo: number,
): {
  paidKobo: number;
  processorFeeKobo: number;
  borneBy: "business" | "us" | "mismatch";
} {
  const { grossKobo, feeKobo, netKobo } = query;
  if (netKobo === cardPartKobo && grossKobo === cardPartKobo + feeKobo) {
    return { paidKobo: cardPartKobo, processorFeeKobo: 0, borneBy: "business" };
  }
  if (grossKobo === cardPartKobo) {
    console.error("cray charged us for a card payment; check feeBearer");
    return { paidKobo: cardPartKobo, processorFeeKobo: feeKobo, borneBy: "us" };
  }
  return {
    paidKobo: grossKobo,
    processorFeeKobo: feeKobo,
    borneBy: "mismatch",
  };
}

/**
 * Asks the payment's own provider about a card payment and, if it succeeded,
 * records it. Throws when the provider or the database can't be reached; the
 * caller retries.
 */
export async function confirmCardPayment(
  reference: string,
  deps?: CardDeps,
): Promise<CardPaymentResult> {
  const d = deps ?? (await realDeps());
  const started = await d.getPaymentProvider(reference);
  // Not a payment we started: nothing to verify, with either provider.
  if (started === null) return "unknown";
  if (started.provider === "cray") {
    return confirmCrayCardPayment(reference, started.cardPartKobo, d);
  }

  const verified = await d.verifyTransaction(reference);
  if (verified.status === "pending") return "pending";
  if (verified.status === "failed" || verified.status === "abandoned") {
    return "failed";
  }
  // Every payment is started in naira; anything else is not ours to apply.
  // Logged (event and reference only) for a person to follow up.
  if (verified.currency !== "NGN") {
    console.error("card payment currency mismatch", reference);
    return "mismatch";
  }

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
    if (result === "mismatch") {
      // Paystack's amount differs from the payment's card part: nothing was
      // funded, and money may have been collected. Logged for follow-up.
      console.error("card payment amount mismatch", reference);
    }
    return result === "unknown_reference" ? "unknown" : result;
  } catch (error) {
    if (error instanceof MoneyStateError) {
      console.error("card payment needs review", reference, error.code);
      return "needs_review";
    }
    throw error;
  }
}

async function confirmCrayCardPayment(
  reference: string,
  cardPartKobo: number,
  d: CardDeps,
): Promise<CardPaymentResult> {
  const query = await d.queryCheckout(reference);
  if (query.status === "pending") return "pending";
  if (query.status === "failed" || query.status === "abandoned") {
    return "failed";
  }
  // We initialise NGN only. A missing currency is accepted; a different one is not ours to apply.
  if (query.currency !== null && query.currency !== "NGN") {
    console.error("card payment currency mismatch", reference);
    return "mismatch";
  }

  const figures = crayCardFigures(query, cardPartKobo);
  try {
    const result = await d.recordCardPayment({
      reference,
      paidKobo: figures.paidKobo,
      paystackFeeKobo: figures.processorFeeKobo,
      eventKey: `cray.charge:${reference}`,
      payload: trim(query.raw, [
        "reference",
        "status",
        "amount",
        "fee",
        "charge",
        "net_amount",
        "currency",
        "channel",
        "paid_at",
        "id",
      ]),
    });
    if (result === "mismatch") {
      console.error("card payment amount mismatch", reference);
    }
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
  | "paid"
  | "failed"
  | "reversed"
  | "duplicate"
  | "ignored"
  | "pending"
  | "unknown"
  // Cray only: the send just happened, or why nothing was sent or settled.
  | "sent"
  | "waiting_for_funds"
  | "needs_reference"
  | "name_changed";

/** Asks Paystack about a payout's transfer and settles the payout if Paystack has an answer. */
export async function confirmTransfer(
  reference: string,
  deps?: TransferDeps,
): Promise<TransferResult> {
  const d = deps ?? (await realDeps());
  const payout = await d.getPayoutByReference(reference);
  if (!payout) return "unknown";
  if (payout.provider === "cray") return confirmCrayTransfer(payout, d);

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
    // Give an in-flight request time to land before re-crediting the wallet,
    // and only ever for a payout we sent (finish_payout guards this too).
    if (payout.status !== "processing") return "pending";
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

/**
 * Sends a Cray payout: the stored number is decrypted here and nowhere else,
 * the account is validated afresh (Cray's ref_id is short-lived and the name
 * must still be the one the creator was shown), then Cray is asked to
 * disburse under our own reference. Cray rejects a repeated reference, so
 * calling this twice for a payout that may already have gone out ends in
 * "needs_reference" (an admin attaches Cray's id), never a second payment.
 * A refusal for a short balance sent nothing and is retried later; any other
 * failure (including a timeout) throws and leaves the payout processing.
 */
export async function sendCrayPayout(
  payout: {
    reference: string;
    bankCode: string;
    accountNumberEncrypted: string;
    accountName: string;
    sendKobo: number;
  },
  deps?: TransferDeps,
): Promise<TransferResult> {
  const d = deps ?? (await realDeps());
  const accountNumber = d.decryptAccountNumber(payout.accountNumberEncrypted);
  const validated = await d.validateAccount(accountNumber, payout.bankCode);
  if (!namesMatch(validated.accountName, payout.accountName)) {
    console.error("cray payout account name changed", payout.reference);
    return "name_changed";
  }

  try {
    const sent = await d.disburse({
      amountKobo: payout.sendKobo,
      reference: payout.reference,
      accountNumber,
      bankCode: payout.bankCode,
      recipientName: validated.accountName,
      refId: validated.refId,
      narration: "Pitchype payout",
    });
    const recorded = await d.recordPayoutSend(
      payout.reference,
      sent.providerReference,
    );
    if (recorded === "conflict") {
      console.error("cray payout id conflict", payout.reference);
    }
    return "sent";
  } catch (error) {
    if (error instanceof CrayError && error.code === "insufficient_balance") {
      // Cray refused: nothing was sent. The next check tries again.
      await d.flagPayout(payout.reference, "waiting_for_funds");
      return "waiting_for_funds";
    }
    if (error instanceof CrayError && error.code === "duplicate_reference") {
      // The reference was used before, so an earlier send may have gone out.
      await d.flagPayout(payout.reference, "needs_reference");
      return "needs_reference";
    }
    throw error;
  }
}

async function confirmCrayTransfer(
  payout: PayoutRecord,
  d: TransferDeps,
): Promise<TransferResult> {
  const reference = payout.reference;
  if (reference === null) return "unknown";

  if (payout.providerReference === null) {
    // Never sent, or sent without our hearing back: only a processing payout is sent.
    if (payout.status !== "processing") return "ignored";
    // The approval sends it straight away. Until 15 minutes have passed that
    // send may still be on its way, and only Cray's duplicate check would stop
    // a second one, so the daily check and "Check with Cray" wait first.
    const approvedAt =
      payout.approvedAt === null ? NaN : Date.parse(payout.approvedAt);
    if (!(approvedAt < stuckPayoutCutoff(d.now()).getTime())) return "pending";
    if (payout.bankCode === null || payout.accountNumberEncrypted === null) {
      console.error("cray payout has no destination", reference);
      return "ignored";
    }
    return sendCrayPayout(
      {
        reference,
        bankCode: payout.bankCode,
        accountNumberEncrypted: payout.accountNumberEncrypted,
        accountName: payout.accountName,
        sendKobo: payout.sendKobo,
      },
      d,
    );
  }

  const cray = payout.providerReference;
  const query = await d.requeryPayout(cray);
  // The answer must be about this payout, and for the amount we asked it to send.
  if (query.merchantReference !== reference) {
    console.error("cray payout reference mismatch", reference);
    return "ignored";
  }
  if (
    (query.status === "success" || query.status === "reversed") &&
    query.sentKobo !== payout.sendKobo
  ) {
    console.error("cray payout amount mismatch", reference);
    return "ignored";
  }

  let outcome: "paid" | "failed" | "reversed";
  let eventKey: string;
  if (query.status === "success") {
    outcome = "paid";
    eventKey = `cray.payout.success:${cray}`;
  } else if (query.status === "failed") {
    outcome = "failed";
    eventKey = `cray.payout.failed:${cray}`;
  } else if (query.status === "reversed") {
    // Taken back after we recorded it paid: re-credit. Taken back before we
    // did: it never reached the creator, so it is a failure.
    outcome = payout.status === "paid" ? "reversed" : "failed";
    eventKey = `cray.payout.reversed:${cray}`;
  } else {
    // Pending. However long it has waited, only Cray's own word fails it.
    return "pending";
  }

  const result = await d.finishPayout({
    reference,
    outcome,
    eventKey,
    payload: trim(query.raw, [
      "id",
      "reference",
      "merchant_reference",
      "status",
      "amount",
      "charge",
      "fee",
    ]),
    sentKobo: outcome === "failed" ? null : query.sentKobo,
    // A reversal re-credits only what was sent: whether Cray also returns its
    // payout charge is unconfirmed (spec §5.4), and booking it would put cash
    // in the ledger that Cray may not hold.
    chargeKobo: outcome === "paid" ? query.chargeKobo : null,
  });
  if (result === "ignored") {
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
 * database outage, any Paystack error but 400/404 (rate limits, key
 * problems), and a charge Paystack still calls pending.
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
      (error.status === 400 || error.status === 404)
    ) {
      // Paystack doesn't know the reference (e.g. a test-mode reference sent
      // to live keys); retrying would get the same answer. Anything else (a
      // rate limit, a key problem, an outage) is retried: nothing else polls
      // card payments, so an acknowledged miss would never be recorded.
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

// Cray webhook ---------------------------------------------------------------------------------

export type CrayWebhookDeps = {
  recordDeposit: (input: {
    provider: "cray";
    accountReference: string;
    accountNumber: string;
    depositReference: string;
    grossKobo: number;
    chargeKobo: number;
    eventKey: string;
    payload: Json;
  }) => Promise<{
    outcome:
      | "funded"
      | "funded_with_extra"
      | "short"
      | "hire_ended"
      | "credited"
      | "duplicate"
      | "unknown_account";
    stillNeededKobo: number | null;
  }>;
  confirmCardPayment: WebhookDeps["confirmCardPayment"];
  confirmTransfer: WebhookDeps["confirmTransfer"];
  /** Our payout for Cray's own id, or null. */
  getPayoutByProviderReference: (
    providerReference: string,
  ) => Promise<{ reference: string | null } | null>;
};

async function realCrayWebhookDeps(): Promise<CrayWebhookDeps> {
  const money = await import("./db/money.ts");
  const payouts = await import("./db/payouts.ts");
  return {
    recordDeposit: money.recordDeposit,
    confirmCardPayment: (reference) => confirmCardPayment(reference),
    confirmTransfer: (reference) => confirmTransfer(reference),
    getPayoutByProviderReference: payouts.getPayoutByProviderReference,
  };
}

const DEPOSIT_EVENT = "collection.virtualaccount.successful";

function field(source: unknown, name: string): unknown {
  return typeof source === "object" && source !== null && !Array.isArray(source)
    ? (source as Record<string, unknown>)[name]
    : undefined;
}

/**
 * Decides what a Cray webhook means.
 *
 * The one event that moves money on its own is a bank-transfer deposit
 * (`collection.virtualaccount.successful`): Cray has no API to look a deposit
 * up, so its signature is the evidence, and it is checked before anything is
 * read (401 if wrong). Everything else is only a HINT: `payin` and the other
 * `collection.*` events carry our `pit_` reference and the payment is then
 * verified with Cray's checkout query; `payout` events carry Cray's id, we
 * find our payout and requery it. A body's own claims of success or amounts
 * are never used for card payments or payouts.
 *
 * 200 tells Cray to stop; 5xx makes it retry (a Cray or database outage, a
 * charge Cray still calls pending, a signed deposit whose figures we cannot
 * read). A reference Cray does not know (400/404) is acknowledged once.
 * Cray's key hint is the last characters of the webhook key it signed with.
 */
export async function handleCrayWebhook(
  rawBody: string,
  keyHint: string | null,
  deps?: CrayWebhookDeps,
): Promise<WebhookResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const event = field(parsed, "event");
  const data = field(parsed, "data");
  if (typeof event !== "string") {
    return { status: 200, body: { ok: true, result: "ignored" } };
  }

  // A deposit credits money with nothing else to check it against.
  if (event === DEPOSIT_EVENT) {
    if (!isValidWebhookHash(data, field(parsed, "hash"), keyHint)) {
      return { status: 401, body: { ok: false } };
    }
  }

  const d = deps ?? (await realCrayWebhookDeps());
  try {
    if (event === DEPOSIT_EVENT) {
      return await handleCrayDeposit(data, d);
    }

    // Our reference comes back as `reference` or `merchant_reference`.
    const reference = [
      field(data, "reference"),
      field(data, "merchant_reference"),
    ].find(
      (value): value is string =>
        typeof value === "string" && CARD_REFERENCE.test(value),
    );
    if (event === "payin" || event.startsWith("collection.")) {
      if (reference === undefined) {
        return { status: 200, body: { ok: true, result: "ignored" } };
      }
      const result = await d.confirmCardPayment(reference);
      // Cray said success but its checkout query doesn't agree yet.
      if (result === "pending") {
        return { status: 503, body: { ok: false, result } };
      }
      return { status: 200, body: { ok: true, result } };
    }

    if (event === "payout" || event.startsWith("payout.")) {
      const crayId = field(data, "reference");
      if (typeof crayId !== "string" || crayId === "") {
        return { status: 200, body: { ok: true, result: "ignored" } };
      }
      const payout = await d.getPayoutByProviderReference(crayId);
      if (payout === null || payout.reference === null) {
        return { status: 200, body: { ok: true, result: "ignored" } };
      }
      const result = await d.confirmTransfer(payout.reference);
      return { status: 200, body: { ok: true, result } };
    }
    return { status: 200, body: { ok: true, result: "ignored" } };
  } catch (error) {
    if (
      error instanceof CrayError &&
      (error.status === 400 || error.status === 404)
    ) {
      // Cray doesn't know the reference (say, a sandbox event sent to live);
      // retrying gets the same answer. Anything else is retried.
      console.error("cray webhook: lookup refused", event, error.status);
      return { status: 200, body: { ok: true, result: "not_verified" } };
    }
    console.error(
      "cray webhook failed",
      event,
      error instanceof CrayError ? `cray ${error.status}` : "error",
    );
    return { status: 500, body: { ok: false } };
  }
}

async function handleCrayDeposit(
  data: unknown,
  d: CrayWebhookDeps,
): Promise<WebhookResponse> {
  const accountReference = field(data, "customer_reference");
  const accountNumber = field(data, "recipient");
  const depositReference = field(data, "transaction_reference");
  if (
    typeof accountReference !== "string" ||
    typeof accountNumber !== "string" ||
    typeof depositReference !== "string" ||
    depositReference === ""
  ) {
    // Not attributable to one of our accounts: nothing to credit. The
    // reconciliation surplus shows the money to an admin.
    console.error("cray deposit without account details");
    return { status: 200, body: { ok: true, result: "ignored" } };
  }
  const currency = field(data, "currency");
  if (currency !== undefined && currency !== null && currency !== "NGN") {
    console.error("cray deposit currency mismatch", depositReference);
    return { status: 200, body: { ok: true, result: "ignored" } };
  }

  // Exact kobo, or a thrown CrayError (a 500: a deposit is never guessed at).
  const amount = field(data, "amount");
  if (typeof amount !== "string" && typeof amount !== "number") {
    throw new CrayError("Cray sent a deposit without an amount", 0);
  }
  const grossKobo = nairaToKobo(amount);
  const charge = field(data, "charge");
  const net = field(data, "net_amount") ?? field(data, "net");
  let chargeKobo: number;
  if (typeof charge === "string" || typeof charge === "number") {
    chargeKobo = nairaToKobo(charge);
  } else if (typeof net === "string" || typeof net === "number") {
    chargeKobo = grossKobo - nairaToKobo(net);
  } else {
    throw new CrayError("Cray sent a deposit without a charge", 0);
  }

  const result = await d.recordDeposit({
    provider: "cray",
    accountReference,
    accountNumber,
    depositReference,
    grossKobo,
    chargeKobo,
    eventKey: `cray.deposit:${depositReference}`,
    // The ids and amounts only: no sender name or account.
    payload: trim(data, [
      "transaction_reference",
      "customer_reference",
      "amount",
      "charge",
      "net_amount",
      "currency",
      "status",
    ]),
  });
  if (result.outcome === "unknown_account") {
    console.error("cray deposit for an unknown account", depositReference);
  }
  return { status: 200, body: { ok: true, result: result.outcome } };
}
