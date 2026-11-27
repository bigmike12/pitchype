// Data access for the admin home's platform figures: one admin-only database
// function reads the counts and money totals from real records. Also the
// counts for the admin sidebar's badges.

import type { AdminAttention } from "@/lib/portal";
import { createSessionClient } from "@/lib/supabase/server";

import { countIdentityAttention } from "./identity";
import { countOpenDisputes } from "./disputes";
import { countNewFeedback } from "./feedback";
import { countPayoutsAwaitingApproval } from "./payouts";
import { getStandingReview } from "./moderation";
import { isObject, num, str } from "./json";

export type PlatformOverview = {
  businesses: number;
  creators: number;
  /** Every campaign except drafts. */
  campaignsTotal: number;
  /** Open or in progress. */
  campaignsLive: number;
  /** Cash businesses paid in (card payments and deposits). Volume, not income. */
  paidInKobo: number;
  /** What reached creators: paid payouts less their transfer cost. */
  paidOutKobo: number;
  /** Our fees kept, after refunds. */
  revenueKobo: number;
  asOf: string;
};

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_platform_overview");
  if (error) throw new Error(`platform overview failed (${error.code})`);
  if (!isObject(data)) throw new Error("platform overview returned no figures");
  return {
    businesses: num(data.businesses) ?? 0,
    creators: num(data.creators) ?? 0,
    campaignsTotal: num(data.campaigns_total) ?? 0,
    campaignsLive: num(data.campaigns_live) ?? 0,
    paidInKobo: num(data.paid_in_kobo) ?? 0,
    paidOutKobo: num(data.paid_out_kobo) ?? 0,
    revenueKobo: num(data.revenue_kobo) ?? 0,
    asOf: str(data.as_of) ?? "",
  };
}

/**
 * What waits on an admin, for the sidebar's badges. Exact counts, not the
 * capped lists the pages read (200 rows), so a badge never reads low. Each
 * count matches the queue its link opens: the same status filter as the list.
 */
export async function countAdminAttention(): Promise<AdminAttention> {
  const supabase = await createSessionClient();
  const [
    campaigns,
    verification,
    profileReports,
    campaignReports,
    standing,
    identity,
    disputes,
    payouts,
    feedback,
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("verification_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .not("submitted_at", "is", null),
    supabase
      .from("profile_reports")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null),
    supabase
      .from("campaign_reports")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null),
    getStandingReview(),
    countIdentityAttention(),
    countOpenDisputes(),
    countPayoutsAwaitingApproval(),
    countNewFeedback(),
  ]);
  for (const result of [
    campaigns,
    verification,
    profileReports,
    campaignReports,
  ]) {
    if (result.error) {
      throw new Error(`admin attention count failed (${result.error.code})`);
    }
  }
  return {
    standing: standing.appeals.length,
    campaigns: campaigns.count ?? 0,
    verification: verification.count ?? 0,
    identity,
    reports: (profileReports.count ?? 0) + (campaignReports.count ?? 0),
    feedback,
    disputes,
    payouts,
  };
}
