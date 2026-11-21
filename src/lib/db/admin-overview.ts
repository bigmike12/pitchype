// Data access for the admin home's platform figures: one admin-only database
// function reads the counts and money totals from real records.

import { createSessionClient } from "@/lib/supabase/server";

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
