// Data access for creator profiles and the directory.
//
// The directory is read through database functions that decide what the
// viewer may see (handles, post links and rates only for businesses and
// admins), so
// it always runs with the viewer's session: the database, not the page, is
// what keeps those fields from visitors. A creator's own profile is read and
// written with their session, under row level security.

import { cacheLife } from "next/cache";
import { cache } from "react";

import {
  DIRECTORY_PAGE_SIZE,
  isFollowerRange,
  isPlatform,
  type CreatorAbout,
  type DirectoryFilters,
  type FollowerRange,
  type Platform,
  type PlatformInput,
  type PlatformListing,
  type SampleInput,
} from "@/lib/creator-profile";
import { KOBO_PER_NAIRA } from "@/lib/money";
import type { NigerianState } from "@/lib/profile";
import { coverUrl, profilePhotoUrl, sampleUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createAnonServerClient,
  createSessionClient,
} from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type Niche = { slug: string; name: string };

/** The niche list. Cached for an hour, so a niche added in SQL shows up within one. */
export async function listNiches(): Promise<Niche[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await createAnonServerClient()
    .from("niches")
    .select("slug, name")
    .order("sort_order");
  if (error) throw new Error(`niches lookup failed (${error.code})`);
  return data;
}

// The directory -------------------------------------------------------------------

export type CreatorCard = {
  slug: string;
  displayName: string;
  photoUrl: string | null;
  coverUrl: string | null;
  /** Public since 2026-11-23; null when the creator hasn't written one. */
  bio: string | null;
  state: NigerianState;
  city: string;
  niches: string[];
  platforms: PlatformListing[];
  /** Null when negotiable, or when this viewer may not see rates. */
  startingRateKobo: number | null;
};

export type CreatorPage = CreatorCard & {
  /**
   * Our user id, for messaging and blocking: only businesses and admins get
   * it (null for everyone else). Server-side only; never render it.
   */
  userId: string | null;
  /** Whether the signed-in person is this creator. */
  isSelf: boolean;
  /** Names the creator's storage folder (for sample URLs). Server-side only. */
  mediaKey: string;
  allowIndexing: boolean;
  updatedAt: string;
  /** Whether this viewer sees handles, post links and rate (businesses and admins). */
  detailsVisible: boolean;
  /** Hires that paid this creator; shown only when above zero. */
  completedJobs: number;
  /** When they joined Pitchype. */
  memberSince: string;
};

export async function searchCreators(
  filters: DirectoryFilters,
): Promise<{ creators: CreatorCard[]; total: number }> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("search_creators", {
    niche_slug: filters.niche,
    on_platform: filters.platform,
    min_followers: filters.minFollowers,
    in_state: filters.state,
    max_rate_kobo: filters.maxRateNaira
      ? filters.maxRateNaira * KOBO_PER_NAIRA
      : undefined,
    page_size: DIRECTORY_PAGE_SIZE,
    page_offset: (filters.page - 1) * DIRECTORY_PAGE_SIZE,
    search: filters.search,
    sort: filters.sort,
  });
  if (error) throw new Error(`creator search failed (${error.code})`);

  return {
    creators: data.map((row) => ({
      slug: row.slug,
      displayName: row.display_name,
      photoUrl: profilePhotoUrl(row.media_key, row.photo_version ?? null),
      coverUrl: coverUrl(row.media_key, row.cover_version ?? null),
      bio: row.bio ?? null,
      state: row.state as NigerianState,
      city: row.city,
      niches: row.niches,
      platforms: toPlatformListings(row.platforms),
      startingRateKobo: row.starting_rate_kobo ?? null,
    })),
    total: data[0]?.total_count ?? 0,
  };
}

/** One listed creator, or null. Memoised per request (metadata + page). */
export const getListedCreator = cache(
  async (slug: string): Promise<CreatorPage | null> => {
    if (!/^[a-z0-9-]{1,70}$/.test(slug)) return null;
    const supabase = await createSessionClient();
    const { data, error } = await supabase
      .rpc("get_listed_creator", { creator_slug: slug })
      .maybeSingle();
    if (error) throw new Error(`creator lookup failed (${error.code})`);
    if (!data) return null;
    return {
      userId: data.user_id ?? null,
      isSelf: data.is_self,
      mediaKey: data.media_key,
      slug: data.slug,
      displayName: data.display_name,
      photoUrl: profilePhotoUrl(data.media_key, data.photo_version ?? null),
      coverUrl: coverUrl(data.media_key, data.cover_version ?? null),
      state: data.state as NigerianState,
      city: data.city,
      niches: data.niches,
      platforms: toPlatformListings(data.platforms),
      startingRateKobo: data.starting_rate_kobo ?? null,
      bio: data.bio ?? null,
      allowIndexing: data.allow_indexing,
      updatedAt: data.updated_at,
      detailsVisible: data.details_visible,
      completedJobs: data.completed_jobs,
      memberSince: data.member_since,
    };
  },
);

export type PortfolioSample = {
  id: string;
  imageUrl: string;
  caption: string | null;
  platform: Platform | null;
  /** Only for businesses and admins: a post's address names the account. */
  postUrl: string | null;
};

/**
 * A listed creator's visible samples, in order. `mediaKey` comes from
 * getListedCreator (it names the files).
 */
export const getCreatorPortfolio = cache(
  async (slug: string, mediaKey: string): Promise<PortfolioSample[]> => {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.rpc("creator_portfolio", {
      creator_slug: slug,
    });
    if (error) throw new Error(`portfolio lookup failed (${error.code})`);
    return data.map((row) => ({
      id: row.id,
      imageUrl: sampleUrl(mediaKey, row.id, row.image_version),
      caption: row.caption ?? null,
      platform: row.platform ?? null,
      postUrl: row.post_url ?? null,
    }));
  },
);

/**
 * The storage folder keys of creators the caller already has ids for (the
 * portal's lists of applicants and conversations), for their photo URLs.
 */
export async function mediaKeysFor(
  userIds: string[],
): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return keys;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("creator_media_keys", {
    creators: ids,
  });
  if (error) throw new Error(`media keys lookup failed (${error.code})`);
  for (const row of data) keys.set(row.user_id, row.media_key);
  return keys;
}

/** Listed creators who allow search engines, for the sitemap. */
export async function listIndexableCreators(): Promise<
  { slug: string; updatedAt: string }[]
> {
  const { data, error } =
    await createAnonServerClient().rpc("indexable_creators");
  if (error) throw new Error(`indexable creators failed (${error.code})`);
  return data.map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

// The JSON the directory functions return for platforms; checked, not trusted.
// Also used for applicants (src/lib/db/applications.ts).
export function toPlatformListings(value: Json): PlatformListing[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PlatformListing[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const p = item as { [key: string]: Json | undefined };
    if (typeof p.platform !== "string" || !isPlatform(p.platform)) return [];
    return [
      {
        platform: p.platform,
        handle: typeof p.handle === "string" ? p.handle : null,
        followerRange:
          typeof p.follower_range === "string" &&
          isFollowerRange(p.follower_range)
            ? p.follower_range
            : null,
        followersUpdatedAt: String(p.followers_updated_at),
        verified: p.verified === true,
        verifiedFollowerCount:
          typeof p.verified_follower_count === "number"
            ? p.verified_follower_count
            : null,
        verifiedAt: typeof p.verified_at === "string" ? p.verified_at : null,
      },
    ];
  });
}

// A creator's own profile ------------------------------------------------------------

export type OwnPlatform = {
  platform: Platform;
  handle: string;
  followerRange: FollowerRange;
  followersUpdatedAt: string;
};

export type OwnCreatorProfile = {
  displayName: string;
  bio: string | null;
  niches: string[];
  state: NigerianState;
  city: string;
  startingRateKobo: number | null;
  photoVersion: number | null;
  photoUrl: string | null;
  coverVersion: number | null;
  coverUrl: string | null;
  /** Names the creator's storage folder. */
  mediaKey: string;
  /** Set on first publish. */
  slug: string | null;
  published: boolean;
  allowIndexing: boolean;
  /** Set when an admin has hidden the profile. */
  hiddenReason: string | null;
  platforms: OwnPlatform[];
};

// Cached per request: the portal shell (for the photo) and the page share it.
export const getOwnCreatorProfile = cache(async function getOwnCreatorProfile(
  userId: string,
): Promise<OwnCreatorProfile | null> {
  const supabase = await createSessionClient();
  const [profile, platforms] = await Promise.all([
    supabase
      .from("influencer_profiles")
      .select(
        "display_name, bio, niches, state, city, starting_rate_kobo, photo_version, cover_version, media_key, slug, published, allow_indexing, hidden_reason",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("influencer_platforms")
      .select("platform, handle, follower_range, followers_updated_at")
      .eq("user_id", userId)
      .order("platform"),
  ]);
  if (profile.error) {
    throw new Error(`creator profile lookup failed (${profile.error.code})`);
  }
  if (platforms.error) {
    throw new Error(`platforms lookup failed (${platforms.error.code})`);
  }
  const row = profile.data;
  if (!row) return null;

  return {
    displayName: row.display_name,
    bio: row.bio,
    niches: row.niches,
    state: row.state as NigerianState,
    city: row.city,
    startingRateKobo: row.starting_rate_kobo,
    photoVersion: row.photo_version,
    photoUrl: profilePhotoUrl(row.media_key, row.photo_version),
    coverVersion: row.cover_version,
    coverUrl: coverUrl(row.media_key, row.cover_version),
    mediaKey: row.media_key,
    slug: row.slug,
    published: row.published,
    allowIndexing: row.allow_indexing,
    hiddenReason: row.hidden_reason,
    platforms: platforms.data.map((p) => ({
      platform: p.platform,
      handle: p.handle,
      followerRange: p.follower_range,
      followersUpdatedAt: p.followers_updated_at,
    })),
  };
});

export async function updateCreatorAbout(
  userId: string,
  about: CreatorAbout,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("influencer_profiles")
    .update({
      display_name: about.displayName,
      bio: about.bio,
      niches: about.niches,
      state: about.state,
      city: about.city,
      starting_rate_kobo: about.startingRateKobo,
    })
    .eq("user_id", userId);
  if (error) throw new Error(`creator profile update failed (${error.code})`);
}

/** Onboarding's niches step: only the niches, on the creator's own row. */
export async function setCreatorNiches(
  userId: string,
  niches: string[],
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("influencer_profiles")
    .update({ niches })
    .eq("user_id", userId);
  if (error) throw new Error(`creator niches update failed (${error.code})`);
}

export async function setCreatorPublished(
  userId: string,
  published: boolean,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("influencer_profiles")
    .update({ published })
    .eq("user_id", userId);
  if (error) throw new Error(`publish failed (${error.code})`);
}

export async function setCreatorIndexing(
  userId: string,
  allowIndexing: boolean,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("influencer_profiles")
    .update({ allow_indexing: allowIndexing })
    .eq("user_id", userId);
  if (error) throw new Error(`indexing update failed (${error.code})`);
}

/** Adds the platform, or updates it if the creator already has it. */
export async function savePlatform(
  userId: string,
  input: PlatformInput,
): Promise<void> {
  const supabase = await createSessionClient();
  // Update first: creators may only change the handle and range, so an
  // upsert (which would also write user_id and platform) isn't allowed.
  const updated = await supabase
    .from("influencer_platforms")
    .update({ handle: input.handle, follower_range: input.followerRange })
    .eq("user_id", userId)
    .eq("platform", input.platform)
    .select("platform");
  if (updated.error) {
    throw new Error(`platform update failed (${updated.error.code})`);
  }
  if (updated.data.length > 0) return;

  const { error } = await supabase.from("influencer_platforms").insert({
    user_id: userId,
    platform: input.platform,
    handle: input.handle,
    follower_range: input.followerRange,
  });
  if (error) throw new Error(`platform insert failed (${error.code})`);
}

export async function removePlatform(
  userId: string,
  platform: Platform,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("influencer_platforms")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);
  if (error) throw new Error(`platform delete failed (${error.code})`);
}

/**
 * Records which photo is current (null: none). Uses the secret key because
 * creators can't write this column: it must only ever point at a photo the
 * server processed. Callers pass the id of the signed-in person, or an
 * admin's moderation target.
 */
export async function setPhotoVersion(
  userId: string,
  version: number | null,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("influencer_profiles")
    .update({ photo_version: version })
    .eq("user_id", userId);
  if (error) throw new Error(`photo version update failed (${error.code})`);
}

/** Records which cover is current (null: none). Secret key, like the photo. */
export async function setCoverVersion(
  userId: string,
  version: number | null,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("influencer_profiles")
    .update({ cover_version: version })
    .eq("user_id", userId);
  if (error) throw new Error(`cover version update failed (${error.code})`);
}

// A creator's own samples ------------------------------------------------------------

export type OwnSample = {
  id: string;
  position: number;
  /** Null while the image is still being stored (or if storing it failed). */
  imageVersion: number | null;
  imageUrl: string | null;
  caption: string | null;
  platform: Platform | null;
  postUrl: string | null;
  /** Set when an admin took it down. */
  hiddenReason: string | null;
};

/** `mediaKey` is the creator's own (OwnCreatorProfile.mediaKey). */
export async function listOwnSamples(
  userId: string,
  mediaKey: string,
): Promise<OwnSample[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("portfolio_samples")
    .select(
      "id, position, image_version, caption, platform, post_url, hidden_reason",
    )
    .eq("user_id", userId)
    .order("position");
  if (error) throw new Error(`samples lookup failed (${error.code})`);
  return data.map((row) => ({
    id: row.id,
    position: row.position,
    imageVersion: row.image_version,
    // A taken-down sample's file is deleted, so there's nothing to show.
    imageUrl:
      row.image_version === null || row.hidden_reason !== null
        ? null
        : sampleUrl(mediaKey, row.id, row.image_version),
    caption: row.caption,
    platform: row.platform,
    postUrl: row.post_url,
    hiddenReason: row.hidden_reason,
  }));
}

/**
 * Adds a sample row at `position` (the image follows with
 * setSampleImageVersion). Returns its id, or "taken" when that position was
 * filled meanwhile (a second tab, a double click).
 */
export async function createSample(
  userId: string,
  position: number,
  input: SampleInput,
): Promise<{ id: string } | "taken"> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("portfolio_samples")
    .insert({
      user_id: userId,
      position,
      caption: input.caption,
      platform: input.platform,
      post_url: input.postUrl,
    })
    .select("id")
    .single();
  if (error?.code === "23505" || error?.code === "23514") return "taken";
  if (error) throw new Error(`sample insert failed (${error.code})`);
  return { id: data.id };
}

export async function updateSample(
  userId: string,
  sampleId: string,
  input: SampleInput,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("portfolio_samples")
    .update({
      caption: input.caption,
      platform: input.platform,
      post_url: input.postUrl,
    })
    .eq("user_id", userId)
    .eq("id", sampleId);
  if (error) throw new Error(`sample update failed (${error.code})`);
}

/** Deletes one of the creator's samples; returns its image version, if any. */
export async function deleteSample(
  userId: string,
  sampleId: string,
): Promise<{ imageVersion: number | null } | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("portfolio_samples")
    .delete()
    .eq("user_id", userId)
    .eq("id", sampleId)
    .select("image_version");
  if (error) throw new Error(`sample delete failed (${error.code})`);
  return data[0] ? { imageVersion: data[0].image_version } : null;
}

/**
 * Points a sample at a stored image. Secret key: creators can't write this
 * column. Callers pass the signed-in creator's id, so only their own rows match.
 */
export async function setSampleImageVersion(
  userId: string,
  sampleId: string,
  version: number,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("portfolio_samples")
    .update({ image_version: version })
    .eq("user_id", userId)
    .eq("id", sampleId);
  if (error) throw new Error(`sample image update failed (${error.code})`);
}

/** Swaps two of the signed-in creator's samples (row level security applies). */
export async function swapSamples(
  first: string,
  second: string,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("swap_portfolio_samples", {
    first_sample: first,
    second_sample: second,
  });
  if (error) throw new Error(`sample swap failed (${error.code})`);
}
