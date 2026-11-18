// Data access for tracked links and their clicks (pay per click, Part 1).
//
// The redirect acts for no signed-in person, so it records hits with the
// secret-key client through record_click(), which is service_role-only in SQL
// and decides what is billable under a lock (migration 20261119100100). The
// pages read through the signed-in session; the summary functions check that
// the caller is on the hire or owns the campaign.

import "server-only";

import type { ClickSource, ClientClass } from "@/lib/clicks";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import { isObject, str } from "./json";

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
