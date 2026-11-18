// Data access for tracked links and their clicks (pay per click, Part 1).
//
// The redirect acts for no signed-in person, so it records hits with the
// secret-key client through record_click(), which is service_role-only in SQL
// and decides what is billable under a lock (migration 20261119100100). The
// pages read through the signed-in session; the summary functions check that
// the caller is on the hire or owns the campaign.

import "server-only";

import { isChannel, type Channel } from "@/lib/campaign";
import type { ClickDay } from "@/lib/click-chart";
import { isFilterReason, type FilterReason } from "@/lib/click-words";
import type { ClickSource, ClientClass } from "@/lib/clicks";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { isObject, list, num, str } from "./json";

export type LinkTarget = {
  destination: string;
  utmTags: boolean;
  campaignId: string;
};

function toTarget(value: Json): LinkTarget | null {
  if (!isObject(value)) return null;
  const destination = str(value.destination);
  const campaignId = str(value.campaignId);
  if (!destination || !campaignId) return null;
  return { destination, campaignId, utmTags: value.utmTags !== false };
}

/** Records one hit. Null for an unknown code; throws if the database fails. */
export async function recordClick(input: {
  code: string;
  visitorHash: string;
  uaHash: string | null;
  referrerHost: string | null;
  source: ClickSource;
  clientClass: ClientClass;
}): Promise<LinkTarget | null> {
  // The generated types don't model SQL nulls for function arguments.
  const nullable = <T>(value: T | null) => value as T;
  const { data, error } = await createAdminClient().rpc("record_click", {
    code: input.code,
    visitor_hash: input.visitorHash,
    ua_hash: nullable<string>(input.uaHash),
    referrer_host: nullable<string>(input.referrerHost),
    source: input.source,
    client_class: input.clientClass,
  });
  if (error) throw new Error(`click record failed (${error.code})`);
  return toTarget(data);
}

/** The link's destination without recording anything; null for an unknown code. */
export async function lookupDestination(
  code: string,
): Promise<LinkTarget | null> {
  const { data, error } = await createAdminClient()
    .from("tracked_links")
    .select("campaign_id, campaigns (destination_url, utm_tags)")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`link lookup failed (${error.code})`);
  if (!data?.campaigns?.destination_url) return null;
  return {
    destination: data.campaigns.destination_url,
    utmTags: data.campaigns.utm_tags,
    campaignId: data.campaign_id,
  };
}

// The hire and campaign pages ---------------------------------------------------------------

export type LinkStats = {
  /** Null while a per-click hire is paid but not started. */
  code: string | null;
  cpcKobo: number;
  capKobo: number;
  billable: number;
  totalHits: number;
  earnedKobo: number;
  filtered: Partial<Record<FilterReason, number>>;
  blockedShares: Channel[];
  blockedChannels: Channel[];
  /** When the link stops counting (end of the deliver-by day, Lagos). */
  clicksEndAt: string | null;
  /** When the hire settles: 72 hours after clicksEndAt. */
  settlesAt: string | null;
  /** When the creator withdrew and the link stopped counting. */
  clicksStoppedAt: string | null;
  /** The creator fee snapshot (null before the hire is paid). */
  creatorFeeBps: number | null;
  creatorMinFeeKobo: number | null;
  /** Hits per Lagos day that had any, oldest first. */
  days: ClickDay[];
  /** Hits by source. */
  sources: Record<string, number>;
};

export type CampaignClicks = {
  billable: number;
  totalHits: number;
  spentKobo: number;
  sources: Record<string, number>;
  days: ClickDay[];
  hires: (LinkStats & {
    engagementId: string;
    creatorName: string;
    proofCount: number;
  })[];
};

function toDays(value: Json | undefined): ClickDay[] {
  return list(value ?? null).flatMap((d) => {
    if (!isObject(d)) return [];
    const day = str(d.day);
    return day
      ? [{ day, billable: num(d.billable) ?? 0, hits: num(d.hits) ?? 0 }]
      : [];
  });
}

function toCounts(value: Json | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  const source = value ?? null;
  if (isObject(source)) {
    for (const [key, n] of Object.entries(source)) {
      if (typeof n === "number") counts[key] = n;
    }
  }
  return counts;
}

function toStats(value: Json): LinkStats | null {
  if (!isObject(value)) return null;
  const cpcKobo = num(value.cpcKobo);
  const capKobo = num(value.capKobo);
  if (cpcKobo === null || capKobo === null) return null;
  const filtered: Partial<Record<FilterReason, number>> = {};
  if (isObject(value.filtered)) {
    for (const [reason, n] of Object.entries(value.filtered)) {
      if (isFilterReason(reason) && typeof n === "number") filtered[reason] = n;
    }
  }
  return {
    code: str(value.code),
    cpcKobo,
    capKobo,
    billable: num(value.billable) ?? 0,
    totalHits: num(value.totalHits) ?? 0,
    earnedKobo: num(value.earnedKobo) ?? 0,
    filtered,
    blockedShares: list(value.blockedShares).filter(
      (c): c is Channel => typeof c === "string" && isChannel(c),
    ),
    blockedChannels: list(value.blockedChannels).filter(
      (c): c is Channel => typeof c === "string" && isChannel(c),
    ),
    clicksEndAt: str(value.clicksEndAt),
    settlesAt: str(value.settlesAt),
    clicksStoppedAt: str(value.clicksStoppedAt),
    creatorFeeBps: num(value.creatorFeeBps),
    creatorMinFeeKobo: num(value.creatorMinFeeKobo),
    days: toDays(value.days),
    sources: toCounts(value.sources),
  };
}

/** A hire's link and counts; null unless it is a per-click hire the caller is on. */
export async function getEngagementClicks(
  engagementId: string,
): Promise<LinkStats | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("engagement_click_summary", {
    engagement: engagementId,
  });
  if (error) throw new Error(`click summary failed (${error.code})`);
  return toStats(data);
}

/** Per-creator counts for the business's per-click campaign; null otherwise. */
export async function getCampaignClicks(
  campaignId: string,
): Promise<CampaignClicks | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("campaign_click_summary", {
    campaign: campaignId,
  });
  if (error) throw new Error(`campaign clicks failed (${error.code})`);
  if (!isObject(data) || !isObject(data.totals)) return null;
  return {
    billable: num(data.totals.billable) ?? 0,
    totalHits: num(data.totals.totalHits) ?? 0,
    spentKobo: num(data.totals.spentKobo) ?? 0,
    sources: toCounts(data.totals.sources),
    days: toDays(data.days),
    hires: list(data.hires).flatMap((h) => {
      const stats = toStats(h);
      if (!stats || !isObject(h)) return [];
      const engagementId = str(h.engagementId);
      return engagementId
        ? [
            {
              ...stats,
              engagementId,
              creatorName: str(h.creatorName) ?? "A creator",
              proofCount: num(h.proofCount) ?? 0,
            },
          ]
        : [];
    }),
  };
}

// The daily job ---------------------------------------------------------------------------

/** Sends due hold notices and settles hires past the hold (service role). */
export async function settleDueClickHires(): Promise<{
  notified: number;
  settled: number;
  failed: number;
}> {
  const { data, error } = await createAdminClient().rpc(
    "settle_due_click_hires",
  );
  if (error) throw new Error(`click settlement failed (${error.code})`);
  const counts = isObject(data) ? data : {};
  return {
    notified: num(counts.notified) ?? 0,
    settled: num(counts.settled) ?? 0,
    failed: num(counts.failed) ?? 0,
  };
}

// The end-of-campaign summary ----------------------------------------------------------------

export type ClickResultsHire = {
  engagementId: string;
  creatorName: string;
  billable: number;
  releasedKobo: number;
  backKobo: number;
  feeKeptKobo: number;
  status: string;
};

export type ClickResults = {
  billable: number;
  spentKobo: number;
  backKobo: number;
  feeKeptKobo: number;
  hires: ClickResultsHire[];
};

/** How a per-click campaign went, once every paid hire has settled; null before. */
export async function getCampaignClickResults(
  campaignId: string,
): Promise<ClickResults | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("campaign_click_results", {
    campaign: campaignId,
  });
  if (error) throw new Error(`click results failed (${error.code})`);
  if (!isObject(data) || !isObject(data.totals)) return null;
  return {
    billable: num(data.totals.billable) ?? 0,
    spentKobo: num(data.totals.spentKobo) ?? 0,
    backKobo: num(data.totals.backKobo) ?? 0,
    feeKeptKobo: num(data.totals.feeKeptKobo) ?? 0,
    hires: list(data.hires).flatMap((h) => {
      if (!isObject(h)) return [];
      const engagementId = str(h.engagementId);
      return engagementId
        ? [
            {
              engagementId,
              creatorName: str(h.creatorName) ?? "A creator",
              billable: num(h.billable) ?? 0,
              releasedKobo: num(h.releasedKobo) ?? 0,
              backKobo: num(h.backKobo) ?? 0,
              feeKeptKobo: num(h.feeKeptKobo) ?? 0,
              status: str(h.status) ?? "",
            },
          ]
        : [];
    }),
  };
}
