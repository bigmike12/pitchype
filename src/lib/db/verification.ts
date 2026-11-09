// Data access for handle verification. Requests are only written by database
// functions, which make the codes and check who may do what (creators ask and
// submit; admins verify or reject). See the create_creator_directory migration.

import type { Platform, VerificationRequest } from "@/lib/creator-profile";
import { createSessionClient } from "@/lib/supabase/server";

export async function listOwnVerificationRequests(
  userId: string,
): Promise<VerificationRequest[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .select(
      "id, platform, handle, code, status, submitted_at, expires_at, created_at, reviewed_at, follower_count_seen",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`verification lookup failed (${error.code})`);
  return data.map((r) => ({
    id: r.id,
    platform: r.platform,
    handle: r.handle,
    code: r.code,
    status: r.status,
    submittedAt: r.submitted_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    followerCountSeen: r.follower_count_seen,
  }));
}

/** Issues a fresh code for one of the signed-in creator's saved platforms. */
export async function requestVerification(platform: Platform): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("request_handle_verification", {
    target_platform: platform,
  });
  if (error) throw new Error(`verification request failed (${error.code})`);
}

/** "expired" when the code ran out (or was replaced) before they submitted. */
export async function submitVerification(
  requestId: string,
): Promise<"submitted" | "expired"> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("submit_handle_verification", {
    request_id: requestId,
  });
  if (!error) return "submitted";
  if (error.code === "P0002") return "expired";
  throw new Error(`verification submit failed (${error.code})`);
}

// Admins -------------------------------------------------------------------------------

export type VerificationQueueItem = {
  id: string;
  platform: Platform;
  handle: string;
  code: string;
  submittedAt: string;
  creator: { displayName: string; slug: string | null };
  /** Another account that holds this handle's badge today. */
  verifiedElsewhere: { displayName: string; slug: string | null } | null;
};

/** Requests waiting for an admin, oldest first. Admins only (RLS). */
export async function listVerificationQueue(): Promise<
  VerificationQueueItem[]
> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .select(
      "id, user_id, platform, handle, code, submitted_at, influencer_profiles (display_name, slug)",
    )
    .eq("status", "pending")
    .not("submitted_at", "is", null)
    .order("submitted_at")
    .limit(200);
  if (error) throw new Error(`verification queue failed (${error.code})`);
  if (data.length === 0) return [];

  const badges = await supabase
    .from("verification_requests")
    .select(
      "user_id, platform, handle, influencer_profiles (display_name, slug)",
    )
    .eq("status", "verified")
    .in(
      "handle",
      data.map((r) => r.handle),
    );
  if (badges.error) {
    throw new Error(`verified handles lookup failed (${badges.error.code})`);
  }

  return data.map((r) => {
    const other = badges.data.find(
      (b) =>
        b.platform === r.platform &&
        b.handle === r.handle &&
        b.user_id !== r.user_id,
    );
    return {
      id: r.id,
      platform: r.platform,
      handle: r.handle,
      code: r.code,
      submittedAt: r.submitted_at ?? "",
      creator: {
        displayName: r.influencer_profiles?.display_name ?? "Unknown creator",
        slug: r.influencer_profiles?.slug ?? null,
      },
      verifiedElsewhere: other
        ? {
            displayName:
              other.influencer_profiles?.display_name ?? "Unknown creator",
            slug: other.influencer_profiles?.slug ?? null,
          }
        : null,
    };
  });
}

export async function reviewVerification(
  requestId: string,
  decision: { approve: true; followerCount: number } | { approve: false },
): Promise<"done" | "not_waiting"> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("review_handle_verification", {
    request_id: requestId,
    approve: decision.approve,
    follower_count: decision.approve ? decision.followerCount : undefined,
  });
  if (!error) return "done";
  // Someone else reviewed it first, or the creator changed the handle.
  if (error.code === "P0002") return "not_waiting";
  throw new Error(`verification review failed (${error.code})`);
}
