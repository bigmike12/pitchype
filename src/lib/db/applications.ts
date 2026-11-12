// Data access for applications and engagements.
//
// Every write goes through a database function that checks the caller,
// their standing and blocks, and protects places and prices (see the
// create_applications migration). Reads come from functions too, because
// they join profiles the caller can't read directly.

import type { ApplicationInput, ApplicationStatus } from "@/lib/applications";
import type { PlatformListing } from "@/lib/creator-profile";
import { profilePhotoUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

import { toPlatformListings } from "./creators";
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

/** Returns the new engagement's id. */
export async function approveApplication(
  applicationId: string,
  expectedPriceKobo: number,
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("approve_application", {
    application: applicationId,
    expected_price_kobo: expectedPriceKobo,
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
  approvedAt: string;
  payBy: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};

function toEngagement(value: Json | undefined): EngagementSummary | null {
  if (!isObject(value) || !str(value.id)) return null;
  return {
    id: str(value.id) ?? "",
    status: (str(value.status) ?? "awaiting_payment") as EngagementStatus,
    agreedPriceKobo: num(value.agreed_price_kobo) ?? 0,
    approvedAt: str(value.approved_at) ?? "",
    payBy: str(value.pay_by) ?? "",
    cancelledAt: str(value.cancelled_at),
    cancelReason: str(value.cancel_reason),
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
  return list(data).flatMap((row) => {
    if (!isObject(row) || !str(row.id)) return [];
    const c = obj(row.creator);
    const creatorId = str(c.id) ?? "";
    return [
      {
        id: str(row.id) ?? "",
        status: (str(row.status) ?? "submitted") as ApplicationStatus,
        proposedPriceKobo: num(row.proposed_price_kobo),
        note: str(row.note),
        decisionNote: str(row.decision_note),
        createdAt: str(row.created_at) ?? "",
        updatedAt: str(row.updated_at) ?? "",
        engagement: toEngagement(row.engagement),
        creator: {
          id: creatorId,
          displayName: str(c.display_name) ?? "",
          slug: str(c.slug),
          photoUrl: profilePhotoUrl(creatorId, num(c.photo_version)),
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
          applicationsCloseOn: str(k.applications_close_on) ?? "",
          businessId: str(k.business_id) ?? "",
          businessName: str(k.business_name) ?? "",
        },
      },
    ];
  });
}

/** Application counts for the signed-in business's campaigns. */
export async function getApplicationCounts(): Promise<
  Map<string, { total: number; waiting: number }>
> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("campaign_application_counts");
  if (error) throw new Error(`application counts failed (${error.code})`);
  return new Map(
    data.map((row) => [
      row.campaign_id,
      { total: row.total, waiting: row.waiting },
    ]),
  );
}

export type EngagementDetails = EngagementSummary & {
  applicationId: string;
  campaign: { id: string; title: string; priceKobo: number };
  creator: { id: string; name: string; slug: string | null };
  business: { id: string; name: string };
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
    applicationId: str(data.application_id) ?? "",
    campaign: {
      id: str(k.id) ?? "",
      title: str(k.title) ?? "",
      priceKobo: num(k.price_kobo) ?? 0,
    },
    creator: {
      id: str(c.id) ?? "",
      name: str(c.name) ?? "",
      slug: str(c.slug),
    },
    business: { id: str(b.id) ?? "", name: str(b.name) ?? "" },
  };
}
