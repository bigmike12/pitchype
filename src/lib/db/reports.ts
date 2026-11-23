// Data access for reports and moderation. Anyone can report a listed
// profile; only admins read reports and hide profiles (checked in the
// database functions and RLS policies).

import type { ReportReason } from "@/lib/creator-profile";
import { coverUrl, profilePhotoUrl, sampleUrl } from "@/lib/storage";
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
    coverUrl: string | null;
    hidden: boolean;
    /** Samples still up, for taking one down. */
    samples: { id: string; imageUrl: string; caption: string | null }[];
  };
};

export async function listOpenReports(): Promise<OpenReport[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("profile_reports")
    .select(
      "id, reason, details, created_at, user_id, influencer_profiles (display_name, slug, photo_version, cover_version, hidden_at)",
    )
    .is("resolved_at", null)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`reports lookup failed (${error.code})`);

  // Admins read every sample (RLS); only visible ones with an image matter here.
  const reported = [...new Set(data.map((r) => r.user_id))];
  const samples = reported.length
    ? await supabase
        .from("portfolio_samples")
        .select("id, user_id, image_version, caption")
        .in("user_id", reported)
        .is("hidden_at", null)
        .not("image_version", "is", null)
        .order("position")
    : { data: [], error: null };
  if (samples.error) {
    throw new Error(`report samples lookup failed (${samples.error.code})`);
  }

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
        coverUrl: coverUrl(r.user_id, r.influencer_profiles?.cover_version ?? null),
        hidden: Boolean(r.influencer_profiles?.hidden_at),
        samples: samples.data.flatMap((sample) =>
          sample.user_id === r.user_id && sample.image_version !== null
            ? [
                {
                  id: sample.id,
                  imageUrl: sampleUrl(r.user_id, sample.id, sample.image_version),
                  caption: sample.caption,
                },
              ]
            : [],
        ),
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

/** Takes a work sample down, with a reason the creator sees. Admins only. */
export async function hideSample(sampleId: string, reason: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("hide_portfolio_sample", {
    sample: sampleId,
    reason,
  });
  if (error) throw new Error(`hide sample failed (${error.code})`);
}

/**
 * Removes a creator's cover, with a reason (recorded in moderation_events).
 * Returns the removed version so its file can be deleted. Admins only.
 */
export async function clearCover(
  userId: string,
  reason: string,
): Promise<number | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("clear_cover", {
    creator: userId,
    reason,
  });
  if (error) throw new Error(`clear cover failed (${error.code})`);
  return data ?? null;
}
