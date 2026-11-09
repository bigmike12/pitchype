// Creator profiles and the directory: platforms, follower ranges, rates,
// niches, and the rules for each. No framework imports, so the parsers can be
// unit-tested. The lists mirror the enums in
// supabase/migrations/20261109133549_create_creator_directory.sql.

import { findContactDetails } from "./contact-details.ts";
import { text, type FieldErrors, type Parsed } from "./form-data.ts";
import { formatNaira, KOBO_PER_NAIRA } from "./money.ts";
import {
  isNigerianState,
  parseProfileForm,
  type NigerianState,
} from "./profile.ts";

// Platforms --------------------------------------------------------------------

export const PLATFORMS = ["instagram", "tiktok", "youtube", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

type PlatformRules = {
  label: string;
  /** Hosts a pasted profile link may come from. */
  hosts: string[];
  /** Usernames as the platform allows them, lowercased. */
  pattern: RegExp;
  hint: string;
  profileUrl: (handle: string) => string;
};

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  instagram: {
    label: "Instagram",
    hosts: ["instagram.com"],
    pattern: /^[a-z0-9._]{1,30}$/,
    hint: "Letters, numbers, full stops and underscores, up to 30.",
    profileUrl: (handle) => `https://www.instagram.com/${handle}/`,
  },
  tiktok: {
    label: "TikTok",
    hosts: ["tiktok.com"],
    pattern: /^[a-z0-9._]{2,24}$/,
    hint: "Letters, numbers, full stops and underscores, 2 to 24.",
    profileUrl: (handle) => `https://www.tiktok.com/@${handle}`,
  },
  youtube: {
    label: "YouTube",
    hosts: ["youtube.com"],
    pattern: /^[a-z0-9._-]{3,30}$/,
    hint: "Your @handle: letters, numbers, full stops, dashes and underscores, 3 to 30.",
    profileUrl: (handle) => `https://www.youtube.com/@${handle}`,
  },
  x: {
    label: "X",
    hosts: ["x.com", "twitter.com"],
    pattern: /^[a-z0-9_]{1,15}$/,
    hint: "Letters, numbers and underscores, up to 15.",
    profileUrl: (handle) => `https://x.com/${handle}`,
  },
};

/**
 * Turns what a creator typed ("@Bayo.Cooks", or a pasted profile link) into
 * the stored handle: lowercase, no "@". Platforms treat usernames as
 * case-insensitive, so this is also what makes duplicates comparable.
 */
export function normalizeHandle(
  platform: Platform,
  raw: string,
): { ok: true; handle: string } | { ok: false; error: string } {
  const rules = PLATFORM_RULES[platform];
  let value = raw.trim();
  if (value === "") {
    return { ok: false, error: `Enter your ${rules.label} username.` };
  }

  const link = value.match(
    /^(?:https?:\/\/)?(?:www\.|m\.|mobile\.)?([a-z.]+)\/([^/?#]+)/i,
  );
  if (link) {
    const [, host, firstSegment] = link;
    if (!rules.hosts.includes(host.toLowerCase())) {
      return {
        ok: false,
        error: `That link is for another site. Paste your ${rules.label} username or profile link.`,
      };
    }
    // youtube.com/channel/… and /c/… links don't contain the @handle.
    if (platform === "youtube" && !firstSegment.startsWith("@")) {
      return {
        ok: false,
        error: "Use your @handle, as in youtube.com/@yourname.",
      };
    }
    value = firstSegment;
  }

  const handle = value.replace(/^@/, "").toLowerCase();
  if (!rules.pattern.test(handle)) {
    return {
      ok: false,
      error: `That doesn’t look like a ${rules.label} username. ${rules.hint}`,
    };
  }
  return { ok: true, handle };
}

// Followers ---------------------------------------------------------------------

export const FOLLOWER_RANGES = [
  "1k_5k",
  "5k_10k",
  "10k_50k",
  "50k_100k",
  "100k_plus",
] as const;
export type FollowerRange = (typeof FOLLOWER_RANGES)[number];

export function isFollowerRange(value: string): value is FollowerRange {
  return (FOLLOWER_RANGES as readonly string[]).includes(value);
}

export const FOLLOWER_RANGE_LABELS: Record<FollowerRange, string> = {
  "1k_5k": "1K–5K",
  "5k_10k": "5K–10K",
  "10k_50k": "10K–50K",
  "50k_100k": "50K–100K",
  "100k_plus": "100K+",
};

/** The directory's followers filter: "at least" the bottom of each range. */
export const MIN_FOLLOWER_LABELS: Record<FollowerRange, string> = {
  "1k_5k": "1K or more",
  "5k_10k": "5K or more",
  "10k_50k": "10K or more",
  "50k_100k": "50K or more",
  "100k_plus": "100K or more",
};

/** What the directory knows about one of a creator's platforms. */
export type PlatformListing = {
  platform: Platform;
  /** Only for businesses and admins; null for everyone else. */
  handle: string | null;
  /** Null only for a verified account under 1,000 followers. */
  followerRange: FollowerRange | null;
  followersUpdatedAt: string;
  verified: boolean;
  verifiedFollowerCount: number | null;
  verifiedAt: string | null;
};

// Dates in Nigeria's time zone, the same on server and client.
const dayMonthYear = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});
const dateAndTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

export const formatDate = (iso: string) => dayMonthYear.format(new Date(iso));
export const formatDateTime = (iso: string) =>
  dateAndTime.format(new Date(iso));

/** "Verified: 12,400 followers as of 3 Nov 2026" or "1K–5K followers". */
export function followersText(listing: PlatformListing): string {
  if (listing.verified && listing.verifiedFollowerCount !== null) {
    const count = listing.verifiedFollowerCount.toLocaleString("en-NG");
    return `${count} followers`;
  }
  return listing.followerRange
    ? `${FOLLOWER_RANGE_LABELS[listing.followerRange]} followers`
    : "Followers not shared";
}

/** The line under the follower count: who vouches for it, and since when. */
export function followersSourceText(listing: PlatformListing): string {
  if (listing.verified && listing.verifiedAt) {
    return `Verified, as of ${formatDate(listing.verifiedAt)}`;
  }
  return `Self-reported, updated ${formatDate(listing.followersUpdatedAt)}`;
}

// Verification ---------------------------------------------------------------------

export type VerificationRequest = {
  id: string;
  platform: Platform;
  handle: string;
  code: string;
  status: "pending" | "verified" | "rejected" | "expired" | "revoked";
  submittedAt: string | null;
  expiresAt: string;
  createdAt: string;
  reviewedAt: string | null;
  followerCountSeen: number | null;
};

export type VerificationView = {
  /** The current badge, if this handle has one. */
  verified: { followerCount: number; verifiedAt: string } | null;
  /** Where the latest request for this handle stands. */
  step:
    | { kind: "none" }
    | {
        kind: "awaiting_code";
        requestId: string;
        code: string;
        expiresAt: string;
      }
    | { kind: "in_review"; submittedAt: string }
    | { kind: "rejected" }
    | { kind: "revoked" };
};

/**
 * What a creator sees for one platform, from their requests. Only requests
 * for the platform's current handle count: a badge belongs to a handle.
 */
export function verificationView(
  requests: readonly VerificationRequest[],
  platform: Platform,
  handle: string,
  now: Date,
): VerificationView {
  const forHandle = requests
    .filter((r) => r.platform === platform && r.handle === handle)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const badge = forHandle.find((r) => r.status === "verified");
  const verified =
    badge && badge.followerCountSeen !== null && badge.reviewedAt
      ? { followerCount: badge.followerCountSeen, verifiedAt: badge.reviewedAt }
      : null;

  const latest = forHandle[0];
  let step: VerificationView["step"] = { kind: "none" };
  if (latest?.status === "pending") {
    if (latest.submittedAt) {
      step = { kind: "in_review", submittedAt: latest.submittedAt };
    } else if (Date.parse(latest.expiresAt) > now.getTime()) {
      step = {
        kind: "awaiting_code",
        requestId: latest.id,
        code: latest.code,
        expiresAt: latest.expiresAt,
      };
    }
  } else if (latest?.status === "rejected") {
    step = { kind: "rejected" };
  } else if (latest?.status === "revoked" && !verified) {
    step = { kind: "revoked" };
  }
  return { verified, step };
}

// Rates ---------------------------------------------------------------------------

export const MIN_RATE_NAIRA = 1_000;
export const MAX_RATE_NAIRA = 100_000_000;

/**
 * A starting rate typed in naira ("50,000", "₦50000"), as kobo. Blank means
 * negotiable (null). Whole naira only: rates are a starting point, not a quote.
 */
export function parseRate(
  raw: string,
): { ok: true; kobo: number | null } | { ok: false; error: string } {
  const cleaned = raw.replace(/[₦,\s]/g, "").replace(/^ngn/i, "");
  if (cleaned === "") return { ok: true, kobo: null };
  if (!/^\d+$/.test(cleaned)) {
    return {
      ok: false,
      error: "Enter a whole number of naira, like 50,000.",
    };
  }
  const naira = Number(cleaned);
  if (naira < MIN_RATE_NAIRA) {
    return {
      ok: false,
      error: `The lowest starting rate is ${formatNaira(MIN_RATE_NAIRA * KOBO_PER_NAIRA)}.`,
    };
  }
  if (naira > MAX_RATE_NAIRA) {
    return {
      ok: false,
      error: `Enter ${formatNaira(MAX_RATE_NAIRA * KOBO_PER_NAIRA)} or less.`,
    };
  }
  return { ok: true, kobo: naira * KOBO_PER_NAIRA };
}

export function startingRateText(kobo: number | null): string {
  return kobo === null ? "Rate negotiable" : `From ${formatNaira(kobo)}`;
}

/** The businesses-only price filter: "Up to ₦50,000" and so on. */
export const MAX_RATE_OPTIONS_NAIRA = [
  20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
] as const;

// The "About you" form ----------------------------------------------------------------

export const MAX_NICHES = 3;
export const MAX_BIO_LENGTH = 300;

export type CreatorAbout = {
  displayName: string;
  bio: string | null;
  niches: string[];
  state: NigerianState;
  city: string;
  startingRateKobo: number | null;
};

export type AboutField =
  "displayName" | "bio" | "niches" | "state" | "city" | "startingRate";

/** `nicheSlugs` is the current list from the database. */
export function parseAboutForm(
  form: FormData,
  nicheSlugs: readonly string[],
): Parsed<CreatorAbout, AboutField> {
  // Name, state and city follow the onboarding rules.
  const base = parseProfileForm("influencer", form);
  const person =
    base.ok && base.value.role === "influencer" ? base.value : null;
  const errors: FieldErrors<AboutField> = base.ok ? {} : { ...base.errors };

  const bio = text(form, "bio").trim();
  const contact = findContactDetails(bio);
  if (bio.length > MAX_BIO_LENGTH) {
    errors.bio = `Use ${MAX_BIO_LENGTH} characters or fewer (you have ${bio.length}).`;
  } else if (contact) {
    errors.bio = `Remove the ${contact}. Businesses contact you through Pitchype, which keeps your payment protected.`;
  }

  const chosen = form.getAll("niches").filter((v) => typeof v === "string");
  const niches = [...new Set(chosen)].filter((slug) =>
    nicheSlugs.includes(slug),
  );
  if (niches.length === 0) errors.niches = "Choose at least one niche.";
  else if (niches.length > MAX_NICHES) {
    errors.niches = `Choose up to ${MAX_NICHES} niches.`;
  }

  const rateInput = text(form, "startingRate").trim();
  const rate = parseRate(rateInput);
  if (!rate.ok) errors.startingRate = rate.error;

  const values = {
    displayName: person ? person.displayName : text(form, "displayName").trim(),
    state: person ? person.state : text(form, "state"),
    city: person ? person.city : text(form, "city").trim(),
    bio,
    niches: niches.join(","),
    startingRate: rateInput,
  };

  if (!person || !rate.ok || Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }
  return {
    ok: true,
    value: {
      displayName: person.displayName,
      state: person.state,
      city: person.city,
      bio: bio === "" ? null : bio,
      niches,
      startingRateKobo: rate.kobo,
    },
  };
}

// The platform form ------------------------------------------------------------------

export type PlatformInput = {
  platform: Platform;
  handle: string;
  followerRange: FollowerRange;
};

export type PlatformField = "handle" | "followerRange";

/** Null when the platform itself is missing or unknown (a tampered form). */
export function parsePlatformForm(
  form: FormData,
): Parsed<PlatformInput, PlatformField> | null {
  const platform = text(form, "platform");
  if (!isPlatform(platform)) return null;

  const rawHandle = text(form, "handle");
  const range = text(form, "followerRange");
  const errors: FieldErrors<PlatformField> = {};

  const handle = normalizeHandle(platform, rawHandle);
  if (!handle.ok) errors.handle = handle.error;
  if (!isFollowerRange(range)) {
    errors.followerRange = "Choose how many followers you have.";
  }

  if (!handle.ok || !isFollowerRange(range)) {
    return {
      ok: false,
      errors,
      values: { handle: rawHandle.trim(), followerRange: range },
    };
  }
  return {
    ok: true,
    value: { platform, handle: handle.handle, followerRange: range },
  };
}

// Publishing -------------------------------------------------------------------------

/** What's missing before a profile can appear in the directory. */
export function publishProblems(profile: {
  niches: readonly string[];
  platformCount: number;
}): string[] {
  const problems: string[] = [];
  if (profile.niches.length === 0) problems.push("Choose at least one niche.");
  if (profile.platformCount === 0) problems.push("Add at least one platform.");
  return problems;
}

// The directory's filters --------------------------------------------------------------

export const DIRECTORY_PAGE_SIZE = 24;

export type DirectoryFilters = {
  niche?: string;
  platform?: Platform;
  minFollowers?: FollowerRange;
  state?: NigerianState;
  /** Businesses only. */
  maxRateNaira?: number;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Reads the filters from the URL. Anything unknown is ignored rather than an
 * error: links get shared, edited and outlive the niche list.
 */
export function parseDirectoryFilters(
  params: SearchParams,
  nicheSlugs: readonly string[],
  { canFilterByRate }: { canFilterByRate: boolean },
): DirectoryFilters {
  const niche = first(params.niche);
  const platform = first(params.platform);
  const minFollowers = first(params.followers);
  const state = first(params.state);
  const maxRate = Number(first(params.maxRate));
  const page = Number(first(params.page));

  return {
    niche: nicheSlugs.includes(niche) ? niche : undefined,
    platform: isPlatform(platform) ? platform : undefined,
    minFollowers: isFollowerRange(minFollowers) ? minFollowers : undefined,
    state: isNigerianState(state) ? state : undefined,
    maxRateNaira:
      canFilterByRate &&
      (MAX_RATE_OPTIONS_NAIRA as readonly number[]).includes(maxRate)
        ? maxRate
        : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** The URL query for a set of filters, e.g. for the next page's link. */
export function directoryQuery(filters: DirectoryFilters): string {
  const query = new URLSearchParams();
  if (filters.niche) query.set("niche", filters.niche);
  if (filters.platform) query.set("platform", filters.platform);
  if (filters.minFollowers) query.set("followers", filters.minFollowers);
  if (filters.state) query.set("state", filters.state);
  if (filters.maxRateNaira) query.set("maxRate", String(filters.maxRateNaira));
  if (filters.page > 1) query.set("page", String(filters.page));
  const result = query.toString();
  return result ? `?${result}` : "";
}

export function hasActiveFilters(filters: DirectoryFilters): boolean {
  return Boolean(
    filters.niche ||
    filters.platform ||
    filters.minFollowers ||
    filters.state ||
    filters.maxRateNaira,
  );
}

// Reports --------------------------------------------------------------------------------

export const REPORT_REASONS = [
  { value: "inappropriate_photo", label: "Inappropriate photo" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "spam_or_scam", label: "Spam or a scam" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason.value === value);
}

export const MAX_REPORT_NOTE_LENGTH = 500;
