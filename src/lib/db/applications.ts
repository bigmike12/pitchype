// Data access for applications and engagements.
//
// Every write goes through a database function that checks the caller,
// their standing and blocks, and protects places and prices (see the
// create_applications migration). Reads come from functions too, because
// they join profiles the caller can't read directly.

import {
  holdsPlace,
  type ApplicationInput,
  type ApplicationStatus,
} from "@/lib/applications";
import type {
  Deliverable,
  DeliverableKind,
  PaymentModel,
} from "@/lib/campaign";
import { isPlatform, type PlatformListing } from "@/lib/creator-profile";
import { profilePhotoUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

import { mediaKeysFor, toPlatformListings } from "./creators";
import { bool, isObject, list, num, obj, str } from "./json";
import { refused, type Refused } from "./refusal";

export type EngagementStatus = Database["public"]["Enums"]["engagement_status"];

type Result<T> = { ok: true; value: T } | Refused;

// The generated types don't model SQL nulls for function arguments.
const nullable = <T>(value: T | null) => value as T;

// Writes ------------------------------------------------------------------------------------

export async function applyToCampaign(
  campaignId: string,
  input: ApplicationInput,
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("apply_to_campaign", {
    campaign: campaignId,
    proposed_price_kobo: nullable<number>(input.proposedPriceKobo),
    note: nullable<string>(input.note),
  });
  if (error) return refused(error, "apply");
  return { ok: true, value: data };
}

export async function editApplication(
  applicationId: string,
  input: ApplicationInput,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("edit_application", {
    application: applicationId,
    proposed_price_kobo: nullable<number>(input.proposedPriceKobo),
    note: nullable<string>(input.note),
  });
  if (error) return refused(error, "application edit");
  return { ok: true, value: null };
}

/**
 * Sets (or with null clears) the price per click a creator proposes on a
 * per-click application. A separate call from applying: the apply functions
 * also carry identity checks that this one has no reason to repeat.
 */
export async function setApplicationRate(
  applicationId: string,
  rateKobo: number | null,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_application_rate", {
    application: applicationId,
    rate_kobo: nullable<number>(rateKobo),
  });
  if (error) return refused(error, "application rate");
  return { ok: true, value: null };
}

export async function withdrawApplication(
  applicationId: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("withdraw_application", {
    application: applicationId,
  });
  if (error) return refused(error, "withdraw");
  return { ok: true, value: null };
}

export async function decideApplication(
  applicationId: string,
  decision: "shortlisted" | "rejected",
  note: string | null,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("decide_application", {
    application: applicationId,
    decision,
    note: nullable<string>(note),
  });
  if (error) return refused(error, "decision");
  return { ok: true, value: null };
}

/**
 * Returns the new engagement's id. A per-click hire is approved at the rate
 * the business saw (`expectedCpcKobo`); if the creator changed it since, the
 * database refuses with rate_changed.
 */
export async function approveApplication(
  applicationId: string,
  expectedPriceKobo: number,
  expectedCpcKobo: number | null = null,
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } =
    expectedCpcKobo === null
      ? await supabase.rpc("approve_application", {
          application: applicationId,
          expected_price_kobo: expectedPriceKobo,
        })
      : await supabase.rpc("approve_application_at_rate", {
          application: applicationId,
          expected_price_kobo: expectedPriceKobo,
          expected_cpc_kobo: expectedCpcKobo,
        });
  if (error) return refused(error, "approve");
  return { ok: true, value: data };
}

export async function cancelEngagement(
  engagementId: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("cancel_engagement", {
    engagement: engagementId,
  });
  if (error) return refused(error, "cancel");
  return { ok: true, value: null };
}

/**
 * Lapses unpaid approvals past their 48 hours. Run by the scheduled job with
 * the secret key: there is no signed-in person.
 */
export async function expireUnpaidEngagements(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "expire_unpaid_engagements",
    {},
  );
  if (error) throw new Error(`expiry failed (${error.code})`);
  return data;
}

// Reads ------------------------------------------------------------------------------------

export type EngagementSummary = {
  id: string;
  status: EngagementStatus;
  agreedPriceKobo: number;
  /** The price per click agreed at approval; null on a fixed-price hire. */
  cpcKobo: number | null;
  approvedAt: string;
  payBy: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  // Stage 6: funding, work started, settlement and the fee snapshot taken at
  // funding (null until each happens).
  fundedAt: string | null;
  startedAt: string | null;
  settledAt: string | null;
  settleOutcome: string | null;
  releasedKobo: number | null;
  refundedKobo: number | null;
  businessFeeKobo: number | null;
  creatorFeeBps: number | null;
  creatorMinFeeKobo: number | null;
};

export function toEngagement(
  value: Json | undefined,
): EngagementSummary | null {
  if (!isObject(value) || !str(value.id)) return null;
  return {
    id: str(value.id) ?? "",
    status: (str(value.status) ?? "awaiting_payment") as EngagementStatus,
    agreedPriceKobo: num(value.agreed_price_kobo) ?? 0,
    cpcKobo: num(value.cpc_kobo),
    approvedAt: str(value.approved_at) ?? "",
    payBy: str(value.pay_by) ?? "",
    cancelledAt: str(value.cancelled_at),
    cancelReason: str(value.cancel_reason),
    fundedAt: str(value.funded_at),
    startedAt: str(value.started_at),
    settledAt: str(value.settled_at),
    settleOutcome: str(value.settle_outcome),
    releasedKobo: num(value.released_kobo),
    refundedKobo: num(value.refunded_kobo),
    businessFeeKobo: num(value.business_fee_kobo),
    creatorFeeBps: num(value.creator_fee_bps),
    creatorMinFeeKobo: num(value.creator_min_fee_kobo),
  };
}

export type Applicant = {
  id: string;
  displayName: string;
  slug: string | null;
  photoUrl: string | null;
  city: string;
  state: string;
  niches: string[];
  bio: string | null;
  startingRateKobo: number | null;
  listed: boolean;
  suspended: boolean;
  blocked: boolean;
  platforms: PlatformListing[];
};

export type CampaignApplication = {
  id: string;
  status: ApplicationStatus;
  proposedPriceKobo: number | null;
  /** A per-click creator's own price per click; null: the campaign's. */
  proposedCpcKobo: number | null;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  engagement: EngagementSummary | null;
  creator: Applicant;
};

/** A campaign's applicants, for its business (or an admin). */
export async function listCampaignApplications(
  campaignId: string,
): Promise<CampaignApplication[] | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("campaign_applications", {
    campaign: campaignId,
  });
  if (error) {
    if (error.message === "no_such_campaign") return null;
    throw new Error(`applications lookup failed (${error.code})`);
  }
  // Photos live under each creator's media key, not their user id.
  const mediaKeys = await mediaKeysFor(
    list(data).flatMap((row) =>
      isObject(row) ? (str(obj(row.creator).id) ?? []) : [],
    ),
  );
  return list(data).flatMap((row) => {
    if (!isObject(row) || !str(row.id)) return [];
    const c = obj(row.creator);
    const creatorId = str(c.id) ?? "";
    const mediaKey = mediaKeys.get(creatorId);
    return [
      {
        id: str(row.id) ?? "",
        status: (str(row.status) ?? "submitted") as ApplicationStatus,
        proposedPriceKobo: num(row.proposed_price_kobo),
        proposedCpcKobo: num(row.proposed_cpc_kobo),
        note: str(row.note),
        decisionNote: str(row.decision_note),
        createdAt: str(row.created_at) ?? "",
        updatedAt: str(row.updated_at) ?? "",
        engagement: toEngagement(row.engagement),
        creator: {
          id: creatorId,
          displayName: str(c.display_name) ?? "",
          slug: str(c.slug),
          photoUrl: mediaKey
            ? profilePhotoUrl(mediaKey, num(c.photo_version))
            : null,
          city: str(c.city) ?? "",
          state: str(c.state) ?? "",
          niches: list(c.niches).flatMap((n) => str(n) ?? []),
          bio: str(c.bio),
          startingRateKobo: num(c.starting_rate_kobo),
          listed: bool(c.listed),
          suspended: bool(c.suspended),
          blocked: bool(c.blocked),
          platforms: toPlatformListings(c.platforms ?? []),
        },
      },
    ];
  });
}

export type MyApplication = {
  id: string;
  status: ApplicationStatus;
  proposedPriceKobo: number | null;
  proposedCpcKobo: number | null;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  engagement: EngagementSummary | null;
  briefEditedAt: string | null;
  campaign: {
    id: string;
    title: string;
    status: string;
    priceKobo: number;
    paymentModel: PaymentModel;
    /** The campaign's price per click (per-click campaigns only). */
    cpcKobo: number | null;
    applicationsCloseOn: string;
    businessId: string;
    businessName: string;
  };
};

/** The signed-in creator's applications, newest first. */
export async function listMyApplications(): Promise<MyApplication[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("my_applications");
  if (error) throw new Error(`my applications failed (${error.code})`);
  return list(data).flatMap((row) => {
    if (!isObject(row) || !str(row.id)) return [];
    const k = obj(row.campaign);
    return [
      {
        id: str(row.id) ?? "",
        status: (str(row.status) ?? "submitted") as ApplicationStatus,
        proposedPriceKobo: num(row.proposed_price_kobo),
        proposedCpcKobo: num(row.proposed_cpc_kobo),
        note: str(row.note),
        decisionNote: str(row.decision_note),
        createdAt: str(row.created_at) ?? "",
        updatedAt: str(row.updated_at) ?? "",
        engagement: toEngagement(row.engagement),
        briefEditedAt: str(row.brief_edited_at),
        campaign: {
          id: str(k.id) ?? "",
          title: str(k.title) ?? "",
          status: str(k.status) ?? "",
          priceKobo: num(k.price_kobo) ?? 0,
          paymentModel: k.payment_model === "per_click" ? "per_click" : "fixed",
          cpcKobo: num(k.cpc_kobo),
          applicationsCloseOn: str(k.applications_close_on) ?? "",
          businessId: str(k.business_id) ?? "",
          businessName: str(k.business_name) ?? "",
        },
      },
    ];
  });
}

export type CampaignCounts = {
  total: number;
  waiting: number;
  /** Places held by hires (see `holdsPlace`). */
  taken: number;
};

/**
 * Application counts and places taken for the signed-in business's
 * campaigns. Places come from its hires, read under RLS (a business sees only
 * its own).
 */
export async function getApplicationCounts(): Promise<
  Map<string, CampaignCounts>
> {
  const supabase = await createSessionClient();
  const [counts, hires] = await Promise.all([
    supabase.rpc("campaign_application_counts"),
    supabase
      .from("engagements")
      .select("campaign_id, status, pay_by")
      .not("status", "in", "(cancelled,refunded)"),
  ]);
  if (counts.error) {
    throw new Error(`application counts failed (${counts.error.code})`);
  }
  if (hires.error)
    throw new Error(`places lookup failed (${hires.error.code})`);

  const now = Date.now();
  const taken = new Map<string, number>();
  for (const hire of hires.data) {
    if (!holdsPlace({ status: hire.status, payBy: hire.pay_by }, now)) continue;
    taken.set(hire.campaign_id, (taken.get(hire.campaign_id) ?? 0) + 1);
  }
  return new Map(
    counts.data.map((row) => [
      row.campaign_id,
      {
        total: row.total,
        waiting: row.waiting,
        taken: taken.get(row.campaign_id) ?? 0,
      },
    ]),
  );
}

export type MyHire = {
  id: string;
  status: EngagementStatus;
  agreedPriceKobo: number;
  payBy: string;
  campaignTitle: string;
};

/**
 * The signed-in business's hires across all its campaigns, newest first, for
 * the home page's pipeline. A plain read under RLS (a business sees only its
 * own hires). The status is as stored, so an unpaid hire past its deadline
 * may still read `awaiting_payment`: callers compare `payBy` with now
 * (`hirePipeline` in lib/home.ts does).
 */
export async function listMyHires(businessId: string): Promise<MyHire[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("engagements")
    .select("id, status, agreed_price_kobo, pay_by, campaigns (title)")
    .eq("business_id", businessId)
    .order("approved_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`hires lookup failed (${error.code})`);
  return data.map((e) => ({
    id: e.id,
    status: e.status,
    agreedPriceKobo: e.agreed_price_kobo,
    payBy: e.pay_by,
    campaignTitle: e.campaigns?.title ?? "",
  }));
}

export type EngagementDetails = EngagementSummary & {
  applicationId: string;
  campaign: {
    id: string;
    title: string;
    priceKobo: number;
    /** The campaign's deliver-by date (YYYY-MM-DD). */
    deliverBy: string;
    /** The campaign's brief as it reads now (the wording can change while live). */
    brief: string;
    /** What the campaign asked for, in order; locked once it was live. */
    deliverables: Deliverable[];
  };
  creator: { id: string; name: string; slug: string | null };
  business: { id: string; name: string };
  /**
   * What the settlement credited to the creator's wallet, read from the
   * ledger (null until the hire is settled).
   */
  creatorNetKobo: number | null;
  // Stage 7: where the review stands.
  /** The latest submission's round (1 to 4), or null before the first. */
  round: number | null;
  /** When the round waiting for review is released on its own. */
  reviewDeadlineAt: string | null;
  /** Resubmissions still allowed: 4 minus the rounds used. */
  roundsLeft: number;
  openDisputeId: string | null;
  /** When the business may dispute missing work; null unless in progress. */
  disputeAllowedFrom: string | null;
};

/** One hire, for either side; null if it isn't theirs. */
export async function getEngagementDetails(
  engagementId: string,
): Promise<EngagementDetails | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("engagement_details", {
    engagement: engagementId,
  });
  if (error) {
    if (error.message === "no_such_engagement" || error.code === "22P02") {
      return null;
    }
    throw new Error(`engagement lookup failed (${error.code})`);
  }
  const summary = toEngagement(data);
  if (!summary || !isObject(data)) return null;
  const k = obj(data.campaign);
  const c = obj(data.creator);
  const b = obj(data.business);
  return {
    ...summary,
    creatorNetKobo: num(data.creator_net_kobo),
    applicationId: str(data.application_id) ?? "",
    campaign: {
      id: str(k.id) ?? "",
      title: str(k.title) ?? "",
      priceKobo: num(k.price_kobo) ?? 0,
      deliverBy: str(k.deliver_by) ?? "",
      brief: str(k.brief) ?? "",
      deliverables: list(k.deliverables).flatMap((d) => {
        if (!isObject(d)) return [];
        const platform = str(d.platform);
        const quantity = num(d.quantity);
        return platform && isPlatform(platform) && quantity
          ? [{ platform, kind: str(d.kind) as DeliverableKind, quantity }]
          : [];
      }),
    },
    creator: {
      id: str(c.id) ?? "",
      name: str(c.name) ?? "",
      slug: str(c.slug),
    },
    business: { id: str(b.id) ?? "", name: str(b.name) ?? "" },
    round: num(data.round),
    reviewDeadlineAt: str(data.review_deadline_at),
    roundsLeft: num(data.rounds_left) ?? 0,
    openDisputeId: str(data.open_dispute_id),
    disputeAllowedFrom: str(data.dispute_allowed_from),
  };
}
