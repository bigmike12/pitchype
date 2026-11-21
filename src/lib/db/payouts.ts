// Data access for bank accounts and payouts.
//
// Every change goes through a database function (create_payouts and
// create_audit migrations) that locks the creator, checks the status and
// writes the ledger. The secret-key client is used only where no signed-in
// person acts (finishing a transfer Paystack confirmed, the stuck-payout poll)
// or where the database must not trust the person (saving a bank account
// whose name Paystack resolved). The app never selects or renders a
// recipient code outside approval, which hands it straight to Paystack. A
// creator can still read their own code through row level security; it is
// only usable with our secret key (column-level restriction is in docs/TODO.md).

import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { obj, str } from "./json";
import { refused, type Refused } from "./refusal";

type Result<T> = { ok: true; value: T } | Refused;

// Bank accounts ------------------------------------------------------------------------------

/**
 * Saves (or replaces) a creator's payout account. Secret-key client: the
 * CALLER passes the signed-in creator's id from the session, and only after
 * Paystack resolved the account name and created the transfer recipient.
 */
export async function saveBankAccount(input: {
  userId: string;
  bankCode: string;
  bankName: string;
  last4: string;
  accountName: string;
  recipientCode: string;
}): Promise<void> {
  const { error } = await createAdminClient().rpc("save_bank_account_for", {
    person: input.userId,
    bank_code: input.bankCode,
    bank_name: input.bankName,
    last4: input.last4,
    account_name: input.accountName,
    recipient_code: input.recipientCode,
  });
  if (error) throw new Error(`bank account save failed (${error.code})`);
}

/**
 * Saves (or replaces) a creator's Cray payout account. Secret-key client, like
 * saveBankAccount: the CALLER passes the signed-in creator's id, only after
 * Cray validated the account, with the number already encrypted
 * (src/lib/account-crypto.ts). The plain number never reaches the database.
 */
export async function saveCrayBankAccount(input: {
  userId: string;
  bankCode: string;
  bankName: string;
  last4: string;
  accountName: string;
  accountNumberEncrypted: string;
}): Promise<void> {
  const { error } = await createAdminClient().rpc(
    "save_cray_bank_account_for",
    {
      person: input.userId,
      bank_code: input.bankCode,
      bank_name: input.bankName,
      last4: input.last4,
      account_name: input.accountName,
      encrypted_number: input.accountNumberEncrypted,
    },
  );
  if (error) throw new Error(`bank account save failed (${error.code})`);
}

export type BankAccount = {
  bankName: string;
  last4: string;
  accountName: string;
};

/** The signed-in creator's payout account for a provider, without the recipient code or number. */
export async function getMyBankAccount(
  provider: "cray" | "paystack",
): Promise<BankAccount | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("bank_name, last4, account_name")
    .eq("provider", provider)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`bank account lookup failed (${error.code})`);
  if (!data) return null;
  return {
    bankName: data.bank_name,
    last4: data.last4,
    accountName: data.account_name,
  };
}

// Creators -----------------------------------------------------------------------------------

/** Returns the new payout's id. The amount is the gross wallet debit. */
export async function requestPayout(
  amountKobo: number,
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("request_payout", {
    amount_kobo: amountKobo,
  });
  if (error) return refused(error, "payout request");
  return { ok: true, value: data };
}

export type PayoutRow = {
  id: string;
  amountKobo: number;
  transferFeeKobo: number;
  status: string;
  decisionReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

/** The signed-in creator's payouts, newest first. */
export async function listMyPayouts(): Promise<PayoutRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(
      "id, amount_kobo, transfer_fee_kobo, status, decision_reason, created_at, paid_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`payouts lookup failed (${error.code})`);
  return data.map((row) => ({
    id: row.id,
    amountKobo: row.amount_kobo,
    transferFeeKobo: row.transfer_fee_kobo,
    status: row.status,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

// Admins -------------------------------------------------------------------------------------

export type PayoutForReview = {
  id: string;
  provider: "cray" | "paystack";
  // Cray: its own id for the transfer, and why a processing payout is held.
  providerReference: string | null;
  waitingForFunds: boolean;
  needsReference: boolean;
  creatorId: string;
  creatorName: string;
  amountKobo: number;
  transferFeeKobo: number;
  status: string;
  // The destination copied when the payout was requested.
  bankName: string;
  last4: string;
  accountName: string;
  reference: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  decisionReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

type PayoutReviewRow = {
  id: string;
  provider: string;
  provider_reference: string | null;
  waiting_for_funds: boolean;
  needs_reference: boolean;
  user_id: string;
  amount_kobo: number;
  transfer_fee_kobo: number;
  status: string;
  bank_name: string;
  last4: string;
  account_name: string;
  reference: string | null;
  approved_by: string | null;
  approved_at: string | null;
  decision_reason: string | null;
  paid_at: string | null;
  created_at: string;
};

const PAYOUT_REVIEW_COLUMNS =
  "id, provider, provider_reference, waiting_for_funds, needs_reference, user_id, amount_kobo, transfer_fee_kobo, status, bank_name, last4, account_name, reference, approved_by, approved_at, decision_reason, paid_at, created_at";

function toProvider(value: string): "cray" | "paystack" {
  if (value === "cray" || value === "paystack") return value;
  throw new Error("payout has an unknown provider");
}

// Row level security shows admins all payouts and all creator profiles. The
// approver stays an id: admins have no profile, and signed-in people can't
// read other users' rows.
async function withCreatorNames(
  rows: PayoutReviewRow[],
): Promise<PayoutForReview[]> {
  const creatorIds = [...new Set(rows.map((row) => row.user_id))];
  const names = new Map<string, string>();
  if (creatorIds.length > 0) {
    const supabase = await createSessionClient();
    const profiles = await supabase
      .from("influencer_profiles")
      .select("user_id, display_name")
      .in("user_id", creatorIds);
    if (profiles.error) {
      throw new Error(`creator names lookup failed (${profiles.error.code})`);
    }
    for (const p of profiles.data) names.set(p.user_id, p.display_name);
  }
  return rows.map((row) => ({
    id: row.id,
    provider: toProvider(row.provider),
    providerReference: row.provider_reference,
    waitingForFunds: row.waiting_for_funds,
    needsReference: row.needs_reference,
    creatorId: row.user_id,
    creatorName: names.get(row.user_id) ?? "",
    amountKobo: row.amount_kobo,
    transferFeeKobo: row.transfer_fee_kobo,
    status: row.status,
    bankName: row.bank_name,
    last4: row.last4,
    accountName: row.account_name,
    reference: row.reference,
    approvedById: row.approved_by,
    approvedAt: row.approved_at,
    decisionReason: row.decision_reason,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }));
}

/** Every payout waiting for approval, oldest first, for admins. Never capped: none may drop out of the queue. */
export async function listPayoutsAwaitingApproval(): Promise<
  PayoutForReview[]
> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(PAYOUT_REVIEW_COLUMNS)
    .eq("status", "requested")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`payouts lookup failed (${error.code})`);
  return withCreatorNames(data);
}

/** How many payouts are waiting for approval, for admins. */
export async function countPayoutsAwaitingApproval(): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("payouts")
    .select("id", { count: "exact", head: true })
    .eq("status", "requested");
  if (error) throw new Error(`payouts count failed (${error.code})`);
  return count ?? 0;
}

/** The most recently decided payouts (anything not waiting), newest first, for admins. */
export async function listRecentDecidedPayouts(
  limit = 100,
): Promise<PayoutForReview[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(PAYOUT_REVIEW_COLUMNS)
    .neq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(`payouts lookup failed (${error.code})`);
  return withCreatorNames(data);
}

/**
 * requested → processing. Returns what the server sends to the payout's
 * provider: the transfer reference (fixed now, so a retry cannot send twice)
 * and the destination saved at request time. For Paystack that is the
 * recipient code; for Cray the bank code and the ENCRYPTED number, which only
 * the send path decrypts.
 */
export type ApprovedPayout =
  | {
      provider: "paystack";
      reference: string;
      recipientCode: string;
      sendKobo: number;
      bankName: string;
      last4: string;
      accountName: string;
    }
  | {
      provider: "cray";
      reference: string;
      bankCode: string;
      accountNumberEncrypted: string;
      sendKobo: number;
      bankName: string;
      last4: string;
      accountName: string;
    };

export async function approvePayout(
  payoutId: string,
): Promise<Result<ApprovedPayout>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("approve_payout", {
    payout: payoutId,
  });
  if (error) return refused(error, "payout approval");
  const value = obj(data);
  const reference = str(value.reference);
  const sendKobo = value.send_kobo;
  if (!reference || typeof sendKobo !== "number") {
    throw new Error("payout approval returned an unexpected shape");
  }
  const common = {
    reference,
    sendKobo,
    bankName: str(value.bank_name) ?? "",
    last4: str(value.last4) ?? "",
    accountName: str(value.account_name) ?? "",
  };
  // Paystack's answer has no `provider` key: it is exactly what it always was.
  if (str(value.provider) === "cray") {
    const bankCode = str(value.bank_code);
    const accountNumberEncrypted = str(value.account_number_encrypted);
    if (!bankCode || !accountNumberEncrypted) {
      throw new Error("payout approval returned an unexpected shape");
    }
    return {
      ok: true,
      value: { provider: "cray", ...common, bankCode, accountNumberEncrypted },
    };
  }
  const recipientCode = str(value.recipient_code);
  if (!recipientCode) {
    throw new Error("payout approval returned an unexpected shape");
  }
  return {
    ok: true,
    value: { provider: "paystack", ...common, recipientCode },
  };
}

/** requested → rejected, with a written reason; the amount returns to the wallet. */
export async function rejectPayout(
  payoutId: string,
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("reject_payout", {
    payout: payoutId,
    reason,
  });
  if (error) return refused(error, "payout rejection");
  return { ok: true, value: null };
}

// The server (webhook and stuck-payout poll) ---------------------------------------------------

/**
 * Records a transfer result the server verified with the payout's provider.
 * Secret-key client. Idempotent in the database: a repeated event is
 * 'duplicate', a result contradicting a final payout is 'ignored'. For Cray,
 * `sentKobo` and `chargeKobo` come from the verified requery; 'reversed' is
 * only for a Cray payout recorded as paid.
 */
export async function finishPayout(input: {
  reference: string;
  outcome: "paid" | "failed" | "reversed";
  eventKey: string;
  payload: Json;
  sentKobo?: number | null;
  chargeKobo?: number | null;
}): Promise<"paid" | "failed" | "reversed" | "duplicate" | "ignored"> {
  const { data, error } = await createAdminClient().rpc("finish_payout", {
    reference: input.reference,
    outcome: input.outcome,
    event_key: input.eventKey,
    payload: input.payload,
    // Omitted when absent so the database default (null) applies.
    ...(input.sentKobo == null ? {} : { sent_kobo: input.sentKobo }),
    ...(input.chargeKobo == null ? {} : { charge_kobo: input.chargeKobo }),
  });
  if (error) throw new Error(`finish payout failed (${error.code})`);
  if (
    data === "paid" ||
    data === "failed" ||
    data === "reversed" ||
    data === "duplicate" ||
    data === "ignored"
  ) {
    return data;
  }
  throw new Error("finish payout returned an unexpected result");
}

export type PayoutToSend = {
  id: string;
  status: string;
  provider: "cray" | "paystack";
  reference: string | null;
  providerReference: string | null;
  approvedAt: string | null;
  // What the bank receives: amount less the creator's transfer fee.
  sendKobo: number;
  // Cray only: the snapshotted destination, never the plain number.
  bankCode: string | null;
  accountNumberEncrypted: string | null;
  accountName: string;
};

const PAYOUT_TO_SEND_COLUMNS =
  "id, status, provider, reference, provider_reference, approved_at, amount_kobo, transfer_fee_kobo, bank_code, account_number_encrypted, account_name";

type PayoutToSendRow = {
  id: string;
  status: string;
  provider: string;
  reference: string | null;
  provider_reference: string | null;
  approved_at: string | null;
  amount_kobo: number;
  transfer_fee_kobo: number;
  bank_code: string | null;
  account_number_encrypted: string | null;
  account_name: string;
};

function toPayoutToSend(row: PayoutToSendRow): PayoutToSend {
  if (row.provider !== "cray" && row.provider !== "paystack") {
    throw new Error("payout has an unknown provider");
  }
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    reference: row.reference,
    providerReference: row.provider_reference,
    approvedAt: row.approved_at,
    sendKobo: row.amount_kobo - row.transfer_fee_kobo,
    bankCode: row.bank_code,
    accountNumberEncrypted: row.account_number_encrypted,
    accountName: row.account_name,
  };
}

/** The payout with this transfer reference, or null. Secret-key client. */
export async function getPayoutByReference(
  reference: string,
): Promise<PayoutToSend | null> {
  const { data, error } = await createAdminClient()
    .from("payouts")
    .select(PAYOUT_TO_SEND_COLUMNS)
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error(`payout lookup failed (${error.code})`);
  return data ? toPayoutToSend(data) : null;
}

/** The Cray payout with Cray's own id, or null. Secret-key client. */
export async function getPayoutByProviderReference(
  providerReference: string,
): Promise<PayoutToSend | null> {
  const { data, error } = await createAdminClient()
    .from("payouts")
    .select(PAYOUT_TO_SEND_COLUMNS)
    .eq("provider_reference", providerReference)
    .maybeSingle();
  if (error) throw new Error(`payout lookup failed (${error.code})`);
  return data ? toPayoutToSend(data) : null;
}

/** Records Cray's id for a payout, once. Secret-key client. */
export async function recordPayoutSend(
  reference: string,
  providerReference: string,
): Promise<"set" | "already_set" | "conflict"> {
  const { data, error } = await createAdminClient().rpc("record_payout_send", {
    payout_reference: reference,
    new_provider_reference: providerReference,
  });
  if (error) throw new Error(`record payout send failed (${error.code})`);
  if (data === "set" || data === "already_set" || data === "conflict") {
    return data;
  }
  throw new Error("record payout send returned an unexpected result");
}

/**
 * Marks a processing Cray payout as waiting for funds (nothing was sent) or
 * needing Cray's reference (the send may have gone out). It stays processing.
 * Secret-key client.
 */
export async function flagPayout(
  reference: string,
  flag: "waiting_for_funds" | "needs_reference",
): Promise<void> {
  const { error } = await createAdminClient().rpc("flag_payout", {
    payout_reference: reference,
    flag,
  });
  if (error) throw new Error(`flag payout failed (${error.code})`);
}

/** An admin pastes Cray's id for a payout whose send is unclear (checked by requery before anything settles). */
export async function attachPayoutReference(
  payoutId: string,
  providerReference: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("attach_payout_reference", {
    payout: payoutId,
    new_provider_reference: providerReference,
  });
  if (error) {
    if (
      error.code === "P0001" &&
      (error.message === "not_allowed" ||
        error.message === "no_such_payout" ||
        error.message === "payout_not_attachable")
    ) {
      return { ok: false, reason: error.message };
    }
    if (error.code === "42501") return { ok: false, reason: "not_allowed" };
    throw new Error(`attach payout reference failed (${error.code})`);
  }
  return { ok: true };
}

/** A payout's transfer reference, for admins (row level security); null if none is fixed yet or no such payout. */
export async function getPayoutReference(
  payoutId: string,
): Promise<string | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("payouts")
    .select("reference")
    .eq("id", payoutId)
    .maybeSingle();
  if (error) throw new Error(`payout lookup failed (${error.code})`);
  return data?.reference ?? null;
}

/** Payouts sent to Paystack before `cutoff` and still waiting for an answer. Secret-key client. */
export async function listProcessingPayoutsOlderThan(
  cutoff: Date,
): Promise<{ id: string; reference: string }[]> {
  const { data, error } = await createAdminClient()
    .from("payouts")
    .select("id, reference")
    .eq("status", "processing")
    .lt("approved_at", cutoff.toISOString())
    .order("approved_at")
    .limit(100);
  if (error) throw new Error(`stuck payouts lookup failed (${error.code})`);
  return data.flatMap((row) =>
    row.reference ? [{ id: row.id, reference: row.reference }] : [],
  );
}

/**
 * A requested payout's destination as the approval pre-check needs it, for
 * admins (row level security). A Cray payout's number comes back encrypted;
 * only the send path decrypts it.
 */
export async function getPayoutForApproval(payoutId: string): Promise<{
  provider: "cray" | "paystack";
  status: string;
  bankCode: string | null;
  accountNumberEncrypted: string | null;
  accountName: string;
} | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(
      "provider, status, bank_code, account_number_encrypted, account_name",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (error) throw new Error(`payout lookup failed (${error.code})`);
  if (!data) return null;
  return {
    provider: toProvider(data.provider),
    status: data.status,
    bankCode: data.bank_code,
    accountNumberEncrypted: data.account_number_encrypted,
    accountName: data.account_name,
  };
}
