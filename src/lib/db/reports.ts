// Data access for reports and moderation. Anyone can report a listed
// profile; only admins read reports and hide profiles (checked in the
// database functions and RLS policies).

import type { ReportReason } from "@/lib/creator-profile";
import { profilePhotoUrl } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/server";

export async function reportCreator(
  slug: string,
  reason: ReportReason,
  note: string | null,
): Promise<"reported" | "not_found"> {
  // The session, if any, records who reported.
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("report_creator", {
    creator_slug: slug,
    reason_code: reason,
    note: note ?? undefined,
  });
  if (!error) return "reported";
  if (error.code === "P0002") return "not_found";
  throw new Error(`report failed (${error.code})`);
}

// Admins -------------------------------------------------------------------------------

export type OpenReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  creator: {
    userId: string;
    displayName: string;
    slug: string | null;
    photoVersion: number | null;
    photoUrl: string | null;
    hidden: boolean;
  };
};

export async function listOpenReports(): Promise<OpenReport[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("profile_reports")
    .select(
      "id, reason, details, created_at, user_id, influencer_profiles (display_name, slug, photo_version, hidden_at)",
    )
    .is("resolved_at", null)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`reports lookup failed (${error.code})`);
  return data.map((r) => {
    const photoVersion = r.influencer_profiles?.photo_version ?? null;
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      createdAt: r.created_at,
      creator: {
        userId: r.user_id,
        displayName: r.influencer_profiles?.display_name ?? "Unknown creator",
        slug: r.influencer_profiles?.slug ?? null,
        photoVersion,
        photoUrl: profilePhotoUrl(r.user_id, photoVersion),
        hidden: Boolean(r.influencer_profiles?.hidden_at),
      },
    };
  });
}

export type HiddenCreator = {
  userId: string;
  displayName: string;
  slug: string | null;
  reason: string;
  hiddenAt: string;
};

export async function listHiddenCreators(): Promise<HiddenCreator[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("influencer_profiles")
    .select("user_id, display_name, slug, hidden_reason, hidden_at")
    .not("hidden_at", "is", null)
    .order("hidden_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`hidden creators lookup failed (${error.code})`);
  return data.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    slug: r.slug,
    reason: r.hidden_reason ?? "",
    hiddenAt: r.hidden_at ?? "",
  }));
}

/** The creator's current photo version, for removing it. Admins only (RLS). */
export async function getCreatorPhotoVersion(
  userId: string,
): Promise<number | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("influencer_profiles")
    .select("photo_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`photo lookup failed (${error.code})`);
  return data?.photo_version ?? null;
}

export async function resolveReport(reportId: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("resolve_profile_report", {
    report_id: reportId,
  });
  if (error) throw new Error(`resolve report failed (${error.code})`);
}

/** Hides a profile (with a reason shown to the creator) or shows it (null). */
export async function setCreatorHidden(
  userId: string,
  reason: string | null,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_creator_hidden", {
    creator: userId,
    // The function treats a blank reason as "show it again".
    reason: reason ?? "",
  });
  if (error) throw new Error(`hide creator failed (${error.code})`);
}
