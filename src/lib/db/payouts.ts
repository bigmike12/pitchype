// Data access for bank accounts and payouts.
//
// Every change goes through a database function (create_payouts and
// create_audit migrations) that locks the creator, checks the status and
// writes the ledger. The secret-key client is used only where no signed-in
// person acts (finishing a transfer Paystack confirmed, the stuck-payout poll)
// or where the database must not trust the person (saving a bank account
// whose name Paystack resolved). Recipient codes never leave the server.

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

export type BankAccount = {
  bankName: string;
  last4: string;
  accountName: string;
};

/** The signed-in creator's payout account, without the recipient code. */
export async function getMyBankAccount(): Promise<BankAccount | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("bank_name, last4, account_name")
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
  "id, user_id, amount_kobo, transfer_fee_kobo, status, bank_name, last4, account_name, reference, approved_by, approved_at, decision_reason, paid_at, created_at";

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
 * requested → processing. Returns what the server sends to Paystack: the
 * transfer reference (fixed now, so a retry cannot send twice) and the
 * destination saved at request time. The recipient code stays on the server.
 */
export async function approvePayout(payoutId: string): Promise<
  Result<{
    reference: string;
    recipientCode: string;
    sendKobo: number;
    bankName: string;
    last4: string;
    accountName: string;
  }>
> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("approve_payout", {
    payout: payoutId,
  });
  if (error) return refused(error, "payout approval");
  const value = obj(data);
  const reference = str(value.reference);
  const recipientCode = str(value.recipient_code);
  const sendKobo = value.send_kobo;
  if (!reference || !recipientCode || typeof sendKobo !== "number") {
    throw new Error("payout approval returned an unexpected shape");
  }
  return {
    ok: true,
    value: {
      reference,
      recipientCode,
      sendKobo,
      bankName: str(value.bank_name) ?? "",
      last4: str(value.last4) ?? "",
      accountName: str(value.account_name) ?? "",
    },
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
 * Records a transfer result the server verified with Paystack. Secret-key
 * client. Idempotent in the database: a repeated event is 'duplicate', a
 * result contradicting a final payout is 'ignored'.
 */
export async function finishPayout(input: {
  reference: string;
  outcome: "paid" | "failed";
  eventKey: string;
  payload: Json;
}): Promise<"paid" | "failed" | "duplicate" | "ignored"> {
  const { data, error } = await createAdminClient().rpc("finish_payout", {
    reference: input.reference,
    outcome: input.outcome,
    event_key: input.eventKey,
    payload: input.payload,
  });
  if (error) throw new Error(`finish payout failed (${error.code})`);
  if (
    data === "paid" ||
    data === "failed" ||
    data === "duplicate" ||
    data === "ignored"
  ) {
    return data;
  }
  throw new Error("finish payout returned an unexpected result");
}

/** The payout with this transfer reference, or null. Secret-key client. */
export async function getPayoutByReference(
  reference: string,
): Promise<{ id: string; status: string; approvedAt: string | null } | null> {
  const { data, error } = await createAdminClient()
    .from("payouts")
    .select("id, status, approved_at")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error(`payout lookup failed (${error.code})`);
  if (!data) return null;
  return { id: data.id, status: data.status, approvedAt: data.approved_at };
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
