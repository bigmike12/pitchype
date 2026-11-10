// Data access for campaigns.
//
// Businesses read and write their own campaigns under row level security;
// status changes go through transition_campaign(), the one place they
// happen. Creators read open campaigns through list_open_campaigns() and
// get_campaign(), which also say why they don't qualify. See the
// create_campaigns migration.

import { cacheLife } from "next/cache";

import {
  type CampaignAction,
  type CampaignInput,
  type CampaignStatus,
  type Deliverable,
  type DeliverableKind,
  type LiveEdit,
  type Problem,
} from "@/lib/campaign";
import {
  isFollowerRange,
  isPlatform,
  type FollowerRange,
  type Platform,
} from "@/lib/creator-profile";
import { isNigerianState, type NigerianState } from "@/lib/profile";
import {
  createAnonServerClient,
  createSessionClient,
} from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { isObject, list, num, str } from "./json";

// A business's own campaigns ------------------------------------------------------

export type OwnCampaignSummary = {
  id: string;
  title: string;
  status: CampaignStatus;
  priceKobo: number | null;
  places: number;
  applicationsCloseOn: string;
  /** An admin's note when a first campaign was sent back to draft. */
  reviewNote: string | null;
  removedReason: string | null;
  updatedAt: string;
};

export async function listOwnCampaigns(
  businessId: string,
): Promise<OwnCampaignSummary[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, title, status, price_kobo, places, applications_close_on, review_note, removed_reason, updated_at",
    )
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`campaigns lookup failed (${error.code})`);
  return data.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    priceKobo: c.price_kobo,
    places: c.places,
    applicationsCloseOn: c.applications_close_on,
    reviewNote: c.review_note,
    removedReason: c.removed_reason,
    updatedAt: c.updated_at,
  }));
}

export type OwnCampaign = CampaignInput & {
  id: string;
  status: CampaignStatus;
  reviewNote: string | null;
  removedReason: string | null;
  publishedAt: string | null;
  revisions: { createdAt: string }[];
};

export async function getOwnCampaign(
  businessId: string,
  campaignId: string,
): Promise<OwnCampaign | null> {
  if (!isUuid(campaignId)) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, status, title, brief, guidelines, niches, states, verified_only, price_kobo, places, applications_close_on, post_from, deliver_by, review_note, removed_reason, published_at, campaign_platforms (platform, min_followers, campaign_deliverables (position, platform, kind, quantity)), campaign_revisions (created_at)",
    )
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`campaign lookup failed (${error.code})`);
  if (!data) return null;

  return {
    id: data.id,
    status: data.status,
    title: data.title,
    brief: data.brief,
    guidelines: data.guidelines,
    niches: data.niches,
    states: data.states as NigerianState[],
    verifiedOnly: data.verified_only,
    // Only fixed-price campaigns exist so far, so there is always a price.
    priceKobo: data.price_kobo ?? 0,
    places: data.places,
    applicationsCloseOn: data.applications_close_on,
    postFrom: data.post_from,
    deliverBy: data.deliver_by,
    reviewNote: data.review_note,
    removedReason: data.removed_reason,
    publishedAt: data.published_at,
    platforms: data.campaign_platforms
      .map((p) => ({ platform: p.platform, minFollowers: p.min_followers }))
      .sort((a, b) => a.platform.localeCompare(b.platform)),
    // Deliverables hang off their platform row (that's what keeps each one
    // on a platform the campaign requires); put them back in order.
    deliverables: data.campaign_platforms
      .flatMap((p) => p.campaign_deliverables)
      .sort((a, b) => a.position - b.position)
      .map((d) => ({
        platform: d.platform,
        kind: d.kind,
        quantity: d.quantity,
      })),
    revisions: data.campaign_revisions
      .map((r) => ({ createdAt: r.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/** Whether an admin has approved one of this business's campaigns (then later ones skip review). */
export async function isTrustedBusiness(businessId: string): Promise<boolean> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .not("approved_at", "is", null);
  if (error) throw new Error(`trust lookup failed (${error.code})`);
  return (count ?? 0) > 0;
}

/** Creates a draft (no id) or replaces one, in one transaction. Returns its id. */
export async function saveCampaignDraft(
  campaignId: string | null,
  input: CampaignInput,
): Promise<string | "not_a_draft"> {
  const supabase = await createSessionClient();
  // The generated types don't model SQL nulls for function arguments.
  const nullable = <T>(value: T | null) => value as T;
  const { data, error } = await supabase.rpc("save_campaign_draft", {
    campaign_id: nullable<string>(campaignId),
    title: input.title,
    brief: input.brief,
    guidelines: nullable<string>(input.guidelines),
    niches: input.niches,
    states: input.states,
    verified_only: input.verifiedOnly,
    price_kobo: input.priceKobo,
    places: input.places,
    applications_close_on: input.applicationsCloseOn,
    post_from: nullable<string>(input.postFrom),
    deliver_by: input.deliverBy,
    platforms: input.platforms.map((p) => ({
      platform: p.platform,
      min_followers: p.minFollowers,
    })),
    deliverables: input.deliverables,
  });
  if (error?.code === "P0002") return "not_a_draft";
  if (error) throw new Error(`campaign save failed (${error.code})`);
  return data;
}

export async function updateLiveCampaign(
  campaignId: string,
  edit: LiveEdit,
): Promise<"saved" | "locked"> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("campaigns")
    .update({
      title: edit.title,
      brief: edit.brief,
      guidelines: edit.guidelines,
      places: edit.places,
      applications_close_on: edit.applicationsCloseOn,
      deliver_by: edit.deliverBy,
    })
    .eq("id", campaignId);
  // The database refuses edits the campaign's status doesn't allow.
  if (error?.code === "42501") return "locked";
  if (error) throw new Error(`campaign update failed (${error.code})`);
  return "saved";
}

/** Deletes a draft that never went live. False if it wasn't one. */
export async function deleteDraft(campaignId: string): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .select("id");
  if (error) throw new Error(`campaign delete failed (${error.code})`);
  return data.length > 0;
}

export type TransitionResult =
  | { ok: true; status: CampaignStatus }
  // `message` is the database's own explanation, written for people.
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "stale" | "not_allowed" };

/** Every status change, for businesses and admins alike. */
export async function transitionCampaign(
  campaignId: string,
  action: CampaignAction,
  note?: string,
): Promise<TransitionResult> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("transition_campaign", {
    campaign_id: campaignId,
    action,
    note,
  });
  if (!error) return { ok: true, status: data };
  if (error.code === "22023" || error.code === "0A000") {
    return { ok: false, reason: "invalid", message: error.message };
  }
  // Wrong status: someone (or another tab) changed it first.
  if (error.code === "55000" || error.code === "P0002") {
    return { ok: false, reason: "stale" };
  }
  if (error.code === "42501") return { ok: false, reason: "not_allowed" };
  throw new Error(`campaign ${action} failed (${error.code})`);
}

export async function countQualifyingCreators(
  campaignId: string,
): Promise<number> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("count_qualifying_creators", {
    campaign: campaignId,
  });
  if (error) throw new Error(`qualifying count failed (${error.code})`);
  return data;
}

// Creators ---------------------------------------------------------------------------

export type CampaignListing = {
  id: string;
  title: string;
  status: CampaignStatus;
  businessName: string;
  businessCity: string;
  businessState: NigerianState;
  niches: string[];
  states: NigerianState[];
  verifiedOnly: boolean;
  priceKobo: number | null;
  places: number;
  applicationsCloseOn: string;
  postFrom: string | null;
  deliverBy: string;
  platforms: { platform: Platform; minFollowers: FollowerRange | null }[];
  deliverables: Deliverable[];
  /** Why the viewing creator doesn't qualify; empty when they do (and for admins). */
  problems: Problem[];
};

export type CampaignDetail = CampaignListing & {
  brief: string;
  guidelines: string | null;
  removedReason: string | null;
  /** When the wording last changed after going live, if it has. */
  revisedAt: string | null;
};

export const CAMPAIGNS_PAGE_SIZE = 24;

export async function listOpenCampaigns(filters: {
  niche?: string;
  platform?: Platform;
  qualifiedOnly: boolean;
  page: number;
}): Promise<{ campaigns: CampaignListing[]; total: number }> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_open_campaigns", {
    niche_slug: filters.niche,
    on_platform: filters.platform,
    qualified_only: filters.qualifiedOnly,
    page_size: CAMPAIGNS_PAGE_SIZE,
    page_offset: (filters.page - 1) * CAMPAIGNS_PAGE_SIZE,
  });
  if (error) throw new Error(`campaign list failed (${error.code})`);
  return {
    campaigns: data.flatMap((row) => {
      const listing = toListing(row.campaign);
      return listing ? [listing] : [];
    }),
    total: data[0]?.total_count ?? 0,
  };
}

/** One campaign for a creator (open ones only) or an admin (any). */
export async function getCampaign(
  campaignId: string,
): Promise<CampaignDetail | null> {
  if (!isUuid(campaignId)) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_campaign", {
    campaign: campaignId,
  });
  if (error) throw new Error(`campaign lookup failed (${error.code})`);
  const listing = toListing(data);
  if (!listing || !isObject(data)) return null;
  return {
    ...listing,
    brief: typeof data.brief === "string" ? data.brief : "",
    guidelines: typeof data.guidelines === "string" ? data.guidelines : null,
    removedReason:
      typeof data.removed_reason === "string" ? data.removed_reason : null,
    revisedAt: typeof data.revised_at === "string" ? data.revised_at : null,
  };
}

/** For the landing page. Cached for an hour; 0 if the database can't be reached. */
export async function openCampaignCount(): Promise<number> {
  "use cache";
  cacheLife("hours");
  try {
    const { data, error } = await createAnonServerClient().rpc(
      "open_campaign_count",
    );
    if (error) throw new Error(error.code);
    return data;
  } catch (error) {
    console.error(
      "open campaign count failed",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}

export async function reportCampaign(
  campaignId: string,
  reason: CampaignReportReason,
  note: string | null,
): Promise<"reported" | "not_found"> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("report_campaign", {
    campaign: campaignId,
    reason_code: reason,
    note: note ?? undefined,
  });
  if (!error) return "reported";
  if (error.code === "P0002") return "not_found";
  throw new Error(`campaign report failed (${error.code})`);
}

// Admins -----------------------------------------------------------------------------------

export type CampaignReportReason =
  | "scam_or_fraud"
  | "banned_content"
  | "off_platform_contact"
  | "misleading"
  | "other";

export type CampaignForReview = {
  id: string;
  title: string;
  businessName: string;
  submittedAt: string;
};

export async function listCampaignsForReview(): Promise<CampaignForReview[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, submitted_at, business_profiles (business_name)")
    .eq("status", "pending_review")
    .order("submitted_at")
    .limit(200);
  if (error) throw new Error(`review queue failed (${error.code})`);
  return data.map((c) => ({
    id: c.id,
    title: c.title,
    businessName: c.business_profiles?.business_name ?? "Unknown business",
    submittedAt: c.submitted_at ?? "",
  }));
}

export type OpenCampaignReport = {
  id: string;
  reason: CampaignReportReason;
  details: string | null;
  createdAt: string;
  campaign: {
    id: string;
    title: string;
    status: CampaignStatus;
    businessName: string;
  };
};

export async function listOpenCampaignReports(): Promise<OpenCampaignReport[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("campaign_reports")
    .select(
      "id, reason, details, created_at, campaigns (id, title, status, business_profiles (business_name))",
    )
    .is("resolved_at", null)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`campaign reports failed (${error.code})`);
  return data.flatMap((r) =>
    r.campaigns
      ? [
          {
            id: r.id,
            reason: r.reason,
            details: r.details,
            createdAt: r.created_at,
            campaign: {
              id: r.campaigns.id,
              title: r.campaigns.title,
              status: r.campaigns.status,
              businessName:
                r.campaigns.business_profiles?.business_name ??
                "Unknown business",
            },
          },
        ]
      : [],
  );
}

export async function resolveCampaignReport(reportId: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("resolve_campaign_report", {
    report_id: reportId,
  });
  if (error) throw new Error(`resolve campaign report failed (${error.code})`);
}

// Parsing the JSON the database functions return; checked, not trusted ------------------------

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    value,
  );
}

function toListing(value: Json): CampaignListing | null {
  if (!isObject(value)) return null;
  const id = str(value.id);
  const title = str(value.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    status: (str(value.status) ?? "open") as CampaignStatus,
    businessName: str(value.business_name) ?? "",
    businessCity: str(value.business_city) ?? "",
    businessState: (str(value.business_state) ?? "Lagos") as NigerianState,
    niches: list(value.niches).filter(
      (n): n is string => typeof n === "string",
    ),
    states: list(value.states).filter(
      (s): s is NigerianState => typeof s === "string" && isNigerianState(s),
    ),
    verifiedOnly: value.verified_only === true,
    priceKobo: num(value.price_kobo),
    places: num(value.places) ?? 0,
    applicationsCloseOn: str(value.applications_close_on) ?? "",
    postFrom: str(value.post_from),
    deliverBy: str(value.deliver_by) ?? "",
    platforms: list(value.platforms).flatMap((p) => {
      if (!isObject(p)) return [];
      const platform = str(p.platform);
      const min = str(p.min_followers);
      return platform && isPlatform(platform)
        ? [{ platform, minFollowers: min && isFollowerRange(min) ? min : null }]
        : [];
    }),
    deliverables: list(value.deliverables).flatMap((d) => {
      if (!isObject(d)) return [];
      const platform = str(d.platform);
      const quantity = num(d.quantity);
      return platform && isPlatform(platform) && quantity
        ? [{ platform, kind: str(d.kind) as DeliverableKind, quantity }]
        : [];
    }),
    problems: list(value.problems).flatMap((p): Problem[] => {
      if (!isObject(p)) return [];
      const platform = str(p.platform);
      const min = str(p.min_followers);
      switch (str(p.code)) {
        case "no_profile":
          return [{ code: "no_profile" }];
        case "niche":
          return [{ code: "niche" }];
        case "state":
          return [{ code: "state" }];
        case "missing_platform":
          return platform && isPlatform(platform)
            ? [{ code: "missing_platform", platform }]
            : [];
        case "not_verified":
          return platform && isPlatform(platform)
            ? [{ code: "not_verified", platform }]
            : [];
        case "followers":
          return platform && isPlatform(platform) && min && isFollowerRange(min)
            ? [{ code: "followers", platform, minFollowers: min }]
            : [];
        default:
          return [];
      }
    }),
  };
}
