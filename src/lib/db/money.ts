// Data access for money: paying for hires, starting work, cancelling and
// settling, wallet balances, the ledger and reconciliation.
//
// Every change goes through a database function that checks the caller, takes
// the locks and writes the ledger in one transaction (the Stage 6 money
// migrations). Functions a signed-in person may call use the session client;
// the few that act for no one person (recording a payment Paystack confirmed,
// a wallet balance for a page that already knows who is signed in,
// reconciliation) use the secret-key client and are service_role-only in SQL.

import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { toEngagement, type EngagementSummary } from "./applications";
import { fundingPaymentByHire } from "../funding-payment";
import { isObject, list, num, obj, str } from "./json";
import { MoneyStateError } from "./money-errors";
import { refused, type Refused } from "./refusal";

export { MoneyStateError };

type Result<T> = { ok: true; value: T } | Refused;

// Paying for a hire --------------------------------------------------------------------------

/**
 * Starts a card payment for an approved hire. The amounts come from the
 * engagement row in the database, never from the caller (CLAUDE.md §6 rule 6).
 */
export async function startPayment(
  engagementId: string,
  feeNoticeSeen: boolean,
): Promise<
  Result<{
    paymentId: string;
    reference: string;
    cardAmountKobo: number;
    email: string;
  }>
> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("start_payment", {
    engagement: engagementId,
    fee_notice_seen: feeNoticeSeen,
  });
  if (error) return refused(error, "start payment");
  const value = obj(data);
  const paymentId = str(value.payment_id);
  const reference = str(value.reference);
  const cardAmountKobo = num(value.card_amount_kobo);
  const email = str(value.email);
  if (!paymentId || !reference || cardAmountKobo === null || !email) {
    throw new Error("start payment returned an unexpected shape");
  }
  return { ok: true, value: { paymentId, reference, cardAmountKobo, email } };
}

/** Funds a hire wholly from the business wallet. */
export async function payFromWallet(
  engagementId: string,
  feeNoticeSeen: boolean,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("pay_from_wallet", {
    engagement: engagementId,
    fee_notice_seen: feeNoticeSeen,
  });
  if (error) return refused(error, "wallet payment");
  return { ok: true, value: null };
}

// The codes record_card_payment raises for states that should never happen.
const MONEY_STATE_CODES = new Set([
  "payment_total_wrong",
  "payment_not_succeeded",
  "invalid_paystack_fee",
]);

/**
 * Records a card payment the server has verified with Paystack. Secret-key
 * client: only the webhook and the payment callback call this, after
 * verifying. Throws MoneyStateError for an impossible state (nothing is
 * written; a person must look), and a plain Error when the database fails.
 */
export async function recordCardPayment(input: {
  reference: string;
  paidKobo: number;
  paystackFeeKobo: number;
  eventKey: string;
  payload: Json;
}): Promise<
  "funded" | "stranded" | "duplicate" | "mismatch" | "unknown_reference"
> {
  const { data, error } = await createAdminClient().rpc("record_card_payment", {
    reference: input.reference,
    paid_kobo: input.paidKobo,
    paystack_fee_kobo: input.paystackFeeKobo,
    event_key: input.eventKey,
    payload: input.payload,
  });
  if (error) {
    if (error.code === "P0001" && error.message === "no_such_payment") {
      return "unknown_reference";
    }
    if (MONEY_STATE_CODES.has(error.message)) {
      throw new MoneyStateError(error.message);
    }
    throw new Error(`record card payment failed (${error.code})`);
  }
  if (
    data === "funded" ||
    data === "stranded" ||
    data === "duplicate" ||
    data === "mismatch"
  ) {
    return data;
  }
  throw new Error("record card payment returned an unexpected result");
}

// Work and settlement ------------------------------------------------------------------------

/** The creator starts work on a funded hire (funded → in_progress). */
export async function startEngagement(
  engagementId: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("start_engagement", {
    engagement: engagementId,
  });
  if (error) return refused(error, "start work");
  return { ok: true, value: null };
}

/** Business cancels or creator withdraws from a funded hire before work starts. */
export async function cancelFundedEngagement(
  engagementId: string,
  feeNoticeSeen: boolean,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("cancel_funded_engagement", {
    engagement: engagementId,
    fee_notice_seen: feeNoticeSeen,
  });
  if (error) return refused(error, "cancel funded hire");
  return { ok: true, value: null };
}

export type SettleOutcome =
  "release" | "refund" | "split" | "refund_creator_fault";

/**
 * An admin settles a hire's escrow, with a written reason. `releaseKobo` is
 * the amount to release for a split; for the other outcomes pass null (the
 * database uses the whole price for a release and nothing for a refund, and
 * refuses any other number).
 */
export async function settleEngagement(
  engagementId: string,
  outcome: SettleOutcome,
  releaseKobo: number | null,
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("settle_engagement", {
    engagement: engagementId,
    outcome,
    release_kobo: nullable<number>(releaseKobo),
    reason,
  });
  if (error) return refused(error, "settle");
  return { ok: true, value: null };
}

// Wallets and the ledger ---------------------------------------------------------------------

/**
 * What the platform owes this person in that wallet, in kobo. Secret-key
 * client (wallet_balance is service_role-only), so the CALLER must pass the
 * signed-in person's own id from requireUser(), never an id from the request.
 */
export async function getWalletBalance(
  personId: string,
  kind: "business_wallet" | "creator_wallet",
): Promise<number> {
  const { data, error } = await createAdminClient().rpc("wallet_balance", {
    person: personId,
    kind,
  });
  if (error) throw new Error(`wallet balance failed (${error.code})`);
  return data;
}

export type LedgerRow = {
  id: string;
  createdAt: string;
  eventType: string;
  account: string;
  amountKobo: number;
  engagementId: string | null;
  reference: string | null;
  /** The hire's amount released from escrow, before our fee (null if unsettled). */
  releasedKobo: number | null;
};

/**
 * The signed-in business's or creator's own wallet lines, newest first.
 * Row level security limits wallet lines to their owner (an admin would see
 * every wallet, so admin pages use listLedger instead). Amounts carry the
 * ledger's sign: a wallet is a liability, so money in is negative.
 */
export async function listMyLedger(limit = 50): Promise<LedgerRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("ledger_entries")
    .select(
      "id, created_at, event_type, account, amount_kobo, engagement_id, paystack_reference, engagement:engagements(released_kobo)",
    )
    .in("account", ["business_wallet", "creator_wallet"])
    .order("created_at", { ascending: false })
    .order("id")
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(`ledger lookup failed (${error.code})`);
  return data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type,
    account: row.account,
    amountKobo: row.amount_kobo,
    engagementId: row.engagement_id,
    reference: row.paystack_reference,
    releasedKobo: row.engagement?.released_kobo ?? null,
  }));
}

export type CreatorWalletSummary = {
  /** Released from escrow for their hires, before our fee. */
  earnedKobo: number;
  /** Our fee on that. */
  feeKobo: number;
  /** Asked for and not returned: sent to the bank or on its way. */
  payoutsKobo: number;
  /** Anything else on the wallet (corrections). */
  otherKobo: number;
};

/**
 * A creator's wallet as earned before fees, fees, payouts and what is left;
 * the parts add up to getWalletBalance(). Secret-key client, like
 * getWalletBalance: pass the signed-in person's own id.
 */
export async function getCreatorWalletSummary(
  personId: string,
): Promise<CreatorWalletSummary> {
  const { data, error } = await createAdminClient().rpc(
    "creator_wallet_summary",
    { person: personId },
  );
  if (error) throw new Error(`wallet summary failed (${error.code})`);
  const row = data[0];
  return {
    earnedKobo: row?.earned_kobo ?? 0,
    feeKobo: row?.fee_kobo ?? 0,
    payoutsKobo: row?.payouts_kobo ?? 0,
    otherKobo: row?.other_kobo ?? 0,
  };
}

export type PaymentRow = {
  id: string;
  reference: string;
  status: string;
  totalKobo: number;
  cardAmountKobo: number;
  walletPartKobo: number;
  createdAt: string;
};

/** A hire's payments, newest first; empty unless the caller is its business (or an admin). */
export async function getPaymentsForEngagement(
  engagementId: string,
): Promise<PaymentRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, reference, status, total_kobo, card_amount_kobo, wallet_part_kobo, created_at",
    )
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "22P02") return [];
    throw new Error(`payments lookup failed (${error.code})`);
  }
  return data.map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    totalKobo: row.total_kobo,
    cardAmountKobo: row.card_amount_kobo,
    walletPartKobo: row.wallet_part_kobo,
    createdAt: row.created_at,
  }));
}

// Admin audit reads --------------------------------------------------------------------------

export type EngagementTrail = {
  engagement: EngagementSummary & {
    campaignId: string;
    campaignTitle: string;
    businessId: string;
    businessName: string;
    creatorId: string;
    creatorName: string;
    feeConfigId: string | null;
    cancelFeeNoticeSeenAt: string | null;
  };
  payments: {
    id: string;
    reference: string;
    status: string;
    totalKobo: number;
    cardAmountKobo: number;
    walletPartKobo: number;
    paystackFeeKobo: number | null;
    createdAt: string;
  }[];
  groups: {
    groupId: string;
    eventType: string;
    createdAt: string;
    actorUserId: string | null;
    actorName: string;
    reason: string | null;
    paystackReference: string | null;
    paymentId: string | null;
    payoutId: string | null;
    lines: { account: string; ownerName: string | null; amountKobo: number }[];
  }[];
  payouts: {
    id: string;
    status: string;
    amountKobo: number;
    transferFeeKobo: number;
    bankName: string;
    last4: string;
    reference: string | null;
    approvedByName: string | null;
    approvedAt: string | null;
    decisionReason: string | null;
    paidAt: string | null;
    createdAt: string;
  }[];
};

/** One hire's money from start to end, for admins; null if there is no such hire. */
export async function getEngagementTrail(
  engagementId: string,
): Promise<EngagementTrail | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_engagement_trail", {
    engagement: engagementId,
  });
  if (error) {
    if (error.message === "no_such_engagement" || error.code === "22P02") {
      return null;
    }
    throw new Error(`engagement trail failed (${error.code})`);
  }
  const root = obj(data);
  const summary = toEngagement(root.engagement);
  if (!summary) return null;
  const e = obj(root.engagement);
  return {
    engagement: {
      ...summary,
      campaignId: str(e.campaign_id) ?? "",
      campaignTitle: str(e.campaign_title) ?? "",
      businessId: str(e.business_id) ?? "",
      businessName: str(e.business_name) ?? "",
      creatorId: str(e.creator_id) ?? "",
      creatorName: str(e.creator_name) ?? "",
      feeConfigId: str(e.fee_config_id),
      cancelFeeNoticeSeenAt: str(e.cancel_fee_notice_seen_at),
    },
    payments: list(root.payments).flatMap((p) => {
      if (!isObject(p) || !str(p.id)) return [];
      return [
        {
          id: str(p.id) ?? "",
          reference: str(p.reference) ?? "",
          status: str(p.status) ?? "",
          totalKobo: num(p.total_kobo) ?? 0,
          cardAmountKobo: num(p.card_amount_kobo) ?? 0,
          walletPartKobo: num(p.wallet_part_kobo) ?? 0,
          paystackFeeKobo: num(p.paystack_fee_kobo),
          createdAt: str(p.created_at) ?? "",
        },
      ];
    }),
    groups: list(root.groups).flatMap((g) => {
      if (!isObject(g) || !str(g.group_id)) return [];
      return [
        {
          groupId: str(g.group_id) ?? "",
          eventType: str(g.event_type) ?? "",
          createdAt: str(g.created_at) ?? "",
          actorUserId: str(g.actor_user_id),
          actorName: str(g.actor_name) ?? "System",
          reason: str(g.reason),
          paystackReference: str(g.paystack_reference),
          paymentId: str(g.payment_id),
          payoutId: str(g.payout_id),
          lines: list(g.lines).flatMap((l) => {
            if (!isObject(l)) return [];
            return [
              {
                account: str(l.account) ?? "",
                ownerName: str(l.owner_name),
                amountKobo: num(l.amount_kobo) ?? 0,
              },
            ];
          }),
        },
      ];
    }),
    payouts: list(root.payouts).flatMap((p) => {
      if (!isObject(p) || !str(p.id)) return [];
      return [
        {
          id: str(p.id) ?? "",
          status: str(p.status) ?? "",
          amountKobo: num(p.amount_kobo) ?? 0,
          transferFeeKobo: num(p.transfer_fee_kobo) ?? 0,
          bankName: str(p.bank_name) ?? "",
          last4: str(p.last4) ?? "",
          reference: str(p.reference),
          approvedByName: str(p.approved_by_name),
          approvedAt: str(p.approved_at),
          decisionReason: str(p.decision_reason),
          paidAt: str(p.paid_at),
          createdAt: str(p.created_at) ?? "",
        },
      ];
    }),
  };
}

export type LedgerFilter = {
  person?: string | null;
  engagement?: string | null;
  eventType?: string | null;
  /** Lagos calendar days, YYYY-MM-DD, inclusive. */
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
  offset?: number;
};

export type AdminLedgerRow = {
  id: string;
  groupId: string;
  eventType: string;
  account: string;
  ownerUserId: string | null;
  ownerName: string | null;
  engagementId: string | null;
  paymentId: string | null;
  payoutId: string | null;
  paystackReference: string | null;
  amountKobo: number;
  actorUserId: string | null;
  actorName: string;
  reason: string | null;
  feeConfigId: string;
  createdAt: string;
};

export type AdminLedgerPage = {
  total: number;
  rowLimit: number;
  rowOffset: number;
  rows: AdminLedgerRow[];
};

// The generated types don't model SQL nulls for function arguments.
const nullable = <T>(value: T | null | undefined) => (value ?? null) as T;

/** The whole ledger, one row per line, newest first, for admins. At most 200 rows a page. */
export async function listLedger(
  filter: LedgerFilter,
): Promise<AdminLedgerPage> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_ledger", {
    person: nullable<string>(filter.person),
    engagement: nullable<string>(filter.engagement),
    event_type: nullable<string>(filter.eventType),
    from_date: nullable<string>(filter.fromDate),
    to_date: nullable<string>(filter.toDate),
    row_limit: nullable<number>(filter.limit),
    row_offset: nullable<number>(filter.offset),
  });
  if (error) throw new Error(`ledger lookup failed (${error.code})`);
  const root = obj(data);
  return {
    total: num(root.total) ?? 0,
    rowLimit: num(root.row_limit) ?? 0,
    rowOffset: num(root.row_offset) ?? 0,
    rows: list(root.rows).flatMap((r) => {
      if (!isObject(r) || !str(r.id)) return [];
      return [
        {
          id: str(r.id) ?? "",
          groupId: str(r.group_id) ?? "",
          eventType: str(r.event_type) ?? "",
          account: str(r.account) ?? "",
          ownerUserId: str(r.owner_user_id),
          ownerName: str(r.owner_name),
          engagementId: str(r.engagement_id),
          paymentId: str(r.payment_id),
          payoutId: str(r.payout_id),
          paystackReference: str(r.paystack_reference),
          amountKobo: num(r.amount_kobo) ?? 0,
          actorUserId: str(r.actor_user_id),
          actorName: str(r.actor_name) ?? "System",
          reason: str(r.reason),
          feeConfigId: str(r.fee_config_id) ?? "",
          createdAt: str(r.created_at) ?? "",
        },
      ];
    }),
  };
}

/** Every status in which a hire's money is still in escrow. */
export const ESCROW_STATUSES = [
  "funded",
  "in_progress",
  "submitted",
  "denied",
  "disputed",
] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

const isEscrowStatus = (status: string): status is EscrowStatus =>
  (ESCROW_STATUSES as readonly string[]).includes(status);

export type EscrowEngagement = {
  id: string;
  status: EscrowStatus;
  agreedPriceKobo: number;
  businessFeeKobo: number | null;
  creatorFeeBps: number | null;
  creatorMinFeeKobo: number | null;
  /**
   * What Paystack charged for the payment that funded the hire, which is the
   * only charge a creator-fault refund subtracts (0 for a wallet-paid hire).
   * Null if that payment can't be found.
   */
  paystackChargeKobo: number | null;
  campaignTitle: string;
  businessName: string;
  creatorName: string;
  fundedAt: string | null;
  startedAt: string | null;
  /** The open dispute on a disputed hire. */
  openDisputeId: string | null;
};

export const ESCROW_LIST_CAP = 200;

const ESCROW_COLUMNS =
  "id, status, agreed_price_kobo, business_fee_kobo, creator_fee_bps, creator_min_fee_kobo, campaign_id, business_id, creator_id, funded_at, started_at";

/**
 * Hires whose money is in escrow right now (paid and not settled: funded, in
 * progress, submitted, sent back or in dispute), oldest payment first, for
 * admins; at most ESCROW_LIST_CAP, with `more` set when there are others. Row
 * level security shows admins every hire, campaign, profile, payment and
 * ledger line, so this uses the session client.
 */
export async function listEscrowEngagements(): Promise<{
  hires: EscrowEngagement[];
  more: boolean;
}> {
  const supabase = await createSessionClient();
  const { data: rows, error } = await supabase
    .from("engagements")
    .select(ESCROW_COLUMNS)
    .in("status", [...ESCROW_STATUSES])
    .is("settled_at", null)
    .order("funded_at", { ascending: true })
    .limit(ESCROW_LIST_CAP + 1);
  if (error) throw new Error(`escrow lookup failed (${error.code})`);
  const more = rows.length > ESCROW_LIST_CAP;
  const hires = await escrowEngagements(
    supabase,
    rows.slice(0, ESCROW_LIST_CAP),
  );
  return { hires, more };
}

/** How many hires hold escrow, exactly (the list above is capped), for admins. */
export async function countEscrowEngagements(): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("engagements")
    .select("id", { count: "exact", head: true })
    .in("status", [...ESCROW_STATUSES])
    .is("settled_at", null);
  if (error) throw new Error(`escrow count failed (${error.code})`);
  return count ?? 0;
}

/** One hire that is still holding escrow, for admins; null if it isn't one. */
export async function getEscrowEngagement(
  engagementId: string,
): Promise<EscrowEngagement | null> {
  const supabase = await createSessionClient();
  const { data: row, error } = await supabase
    .from("engagements")
    .select(ESCROW_COLUMNS)
    .eq("id", engagementId)
    .in("status", [...ESCROW_STATUSES])
    .is("settled_at", null)
    .maybeSingle();
  if (error) {
    // A malformed id is "not found".
    if (error.code === "22P02") return null;
    throw new Error(`escrow lookup failed (${error.code})`);
  }
  if (!row) return null;
  return (await escrowEngagements(supabase, [row]))[0] ?? null;
}

type EscrowRow = {
  id: string;
  status: string;
  agreed_price_kobo: number;
  business_fee_kobo: number | null;
  creator_fee_bps: number | null;
  creator_min_fee_kobo: number | null;
  campaign_id: string;
  business_id: string;
  creator_id: string;
  funded_at: string | null;
  started_at: string | null;
};

/** Adds names, the funding payment's charge and any open dispute to hire rows. */
async function escrowEngagements(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  data: EscrowRow[],
): Promise<EscrowEngagement[]> {
  if (data.length === 0) return [];

  const engagementIds = data.map((row) => row.id);
  const campaignIds = [...new Set(data.map((row) => row.campaign_id))];
  const businessIds = [...new Set(data.map((row) => row.business_id))];
  const creatorIds = [...new Set(data.map((row) => row.creator_id))];

  const [campaigns, businesses, creators, funding, disputes] =
    await Promise.all([
      supabase.from("campaigns").select("id, title").in("id", campaignIds),
      supabase
        .from("business_profiles")
        .select("user_id, business_name")
        .in("user_id", businessIds),
      supabase
        .from("influencer_profiles")
        .select("user_id, display_name")
        .in("user_id", creatorIds),
      // The lines that put each hire's money into escrow; settle_money() reads
      // the payment on the earliest one.
      supabase
        .from("ledger_entries")
        .select("id, engagement_id, payment_id, created_at")
        .eq("account", "escrow")
        .lt("amount_kobo", 0)
        .in("event_type", ["payment_received", "hire_funded"])
        .in("engagement_id", engagementIds),
      supabase
        .from("disputes")
        .select("id, engagement_id")
        .eq("status", "open")
        .in("engagement_id", engagementIds),
    ]);
  for (const result of [campaigns, businesses, creators, funding, disputes]) {
    if (result.error) {
      throw new Error(`escrow lookup failed (${result.error.code})`);
    }
  }

  const fundingPayment = fundingPaymentByHire(
    (funding.data ?? []).flatMap((l) =>
      l.engagement_id
        ? [
            {
              engagementId: l.engagement_id,
              paymentId: l.payment_id,
              createdAt: l.created_at,
              id: l.id,
            },
          ]
        : [],
    ),
  );
  const paymentIds = [
    ...new Set([...fundingPayment.values()].flatMap((id) => (id ? [id] : []))),
  ];
  const charges = new Map<string, number>();
  if (paymentIds.length > 0) {
    const payments = await supabase
      .from("payments")
      .select("id, paystack_fee_kobo")
      .in("id", paymentIds);
    if (payments.error) {
      throw new Error(`escrow lookup failed (${payments.error.code})`);
    }
    // A wallet-only payment has no Paystack charge (null), counted as 0 as in
    // settle_money().
    for (const p of payments.data) charges.set(p.id, p.paystack_fee_kobo ?? 0);
  }
  const chargeFor = (engagementId: string): number | null => {
    const paymentId = fundingPayment.get(engagementId);
    return paymentId ? (charges.get(paymentId) ?? null) : null;
  };

  const titles = new Map(campaigns.data?.map((c) => [c.id, c.title]));
  const businessNames = new Map(
    businesses.data?.map((b) => [b.user_id, b.business_name]),
  );
  const creatorNames = new Map(
    creators.data?.map((c) => [c.user_id, c.display_name]),
  );

  const openDisputes = new Map(
    disputes.data?.map((d) => [d.engagement_id, d.id]),
  );

  return data.flatMap((row) =>
    isEscrowStatus(row.status)
      ? [
          {
            id: row.id,
            status: row.status,
            agreedPriceKobo: row.agreed_price_kobo,
            businessFeeKobo: row.business_fee_kobo,
            creatorFeeBps: row.creator_fee_bps,
            creatorMinFeeKobo: row.creator_min_fee_kobo,
            paystackChargeKobo: chargeFor(row.id),
            campaignTitle: titles.get(row.campaign_id) ?? "",
            businessName: businessNames.get(row.business_id) ?? "",
            creatorName: creatorNames.get(row.creator_id) ?? "",
            fundedAt: row.funded_at,
            startedAt: row.started_at,
            openDisputeId: openDisputes.get(row.id) ?? null,
          },
        ]
      : [],
  );
}

export type SettlementState = {
  agreedPriceKobo: number;
  settledAt: string | null;
  settleOutcome: string | null;
  releasedKobo: number | null;
};

/** Whether (and how) a hire is settled, for admins; null if there is no such hire. */
export async function getSettlementState(
  engagementId: string,
): Promise<SettlementState | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("engagements")
    .select("agreed_price_kobo, settled_at, settle_outcome, released_kobo")
    .eq("id", engagementId)
    .maybeSingle();
  if (error) throw new Error(`settlement lookup failed (${error.code})`);
  if (!data) return null;
  return {
    agreedPriceKobo: data.agreed_price_kobo,
    settledAt: data.settled_at,
    settleOutcome: data.settle_outcome,
    releasedKobo: data.released_kobo,
  };
}

// Reconciliation -----------------------------------------------------------------------------

export type ReconciliationRun = {
  id: string;
  ranAt: string;
  paystackBalanceKobo: number;
  expectedCashKobo: number;
  differenceKobo: number;
  note: string | null;
};

/** The latest reconciliation run, for admins (row level security); null if none yet. */
export async function getLatestReconciliation(): Promise<ReconciliationRun | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("reconciliation_runs")
    .select(
      "id, ran_at, paystack_balance_kobo, expected_cash_kobo, difference_kobo, note",
    )
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reconciliation lookup failed (${error.code})`);
  if (!data) return null;
  return {
    id: data.id,
    ranAt: data.ran_at,
    paystackBalanceKobo: data.paystack_balance_kobo,
    expectedCashKobo: data.expected_cash_kobo,
    differenceKobo: data.difference_kobo,
    note: data.note,
  };
}

/** The most recent reconciliation runs, newest first, for admins (row level security). */
export async function listReconciliationRuns(
  limit = 30,
): Promise<ReconciliationRun[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("reconciliation_runs")
    .select(
      "id, ran_at, paystack_balance_kobo, expected_cash_kobo, difference_kobo, note",
    )
    .order("ran_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(`reconciliation list failed (${error.code})`);
  return data.map((row) => ({
    id: row.id,
    ranAt: row.ran_at,
    paystackBalanceKobo: row.paystack_balance_kobo,
    expectedCashKobo: row.expected_cash_kobo,
    differenceKobo: row.difference_kobo,
    note: row.note,
  }));
}

/**
 * Stores a reconciliation run against Paystack's balance (fetched by the
 * server). Secret-key client: the scheduled job acts for no one person.
 */
export async function recordReconciliation(balanceKobo: number): Promise<{
  expectedCashKobo: number;
  differenceKobo: number;
  ledgerBalanced: boolean;
}> {
  const { data, error } = await createAdminClient().rpc(
    "record_reconciliation",
    { paystack_balance_kobo: balanceKobo },
  );
  if (error) throw new Error(`reconciliation failed (${error.code})`);
  const root = obj(data);
  return {
    expectedCashKobo: num(root.expected_cash_kobo) ?? 0,
    differenceKobo: num(root.difference_kobo) ?? 0,
    ledgerBalanced: root.ledger_balanced === true,
  };
}
