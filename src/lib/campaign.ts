// Campaigns: deliverable types, form rules, money shown to each side, and
// why a creator doesn't qualify. No framework imports, so it can be
// unit-tested. Mirrors supabase/migrations/20261109162551_create_campaigns.sql;
// decisions in docs/campaign-spec-decisions.md.

import { findContactDetails } from "./contact-details.ts";
import {
  MIN_FOLLOWER_LABELS,
  PLATFORM_RULES,
  PLATFORMS,
  isFollowerRange,
  isPlatform,
  type FollowerRange,
  type Platform,
} from "./creator-profile.ts";
import { feeExample } from "./fees.ts";
import { text, type FieldErrors, type Parsed } from "./form-data.ts";
import { formatNaira, KOBO_PER_NAIRA } from "./money.ts";
import { isNigerianState, stateLabel, type NigerianState } from "./profile.ts";

// Deliverables -------------------------------------------------------------------

export type DeliverableKind = "post" | "reel" | "story" | "video" | "short";

/** The kinds of post each platform has; the database refuses the rest. */
export const DELIVERABLE_KINDS: Record<Platform, readonly DeliverableKind[]> = {
  instagram: ["reel", "post", "story"],
  tiktok: ["video"],
  youtube: ["video", "short"],
  x: ["post"],
};

const KIND_NAMES: Record<DeliverableKind, [one: string, many: string]> = {
  post: ["post", "posts"],
  reel: ["reel", "reels"],
  story: ["story", "stories"],
  video: ["video", "videos"],
  short: ["Short", "Shorts"],
};

export function kindLabel(kind: DeliverableKind, quantity = 1): string {
  return KIND_NAMES[kind][quantity === 1 ? 0 : 1];
}

export type Deliverable = {
  platform: Platform;
  kind: DeliverableKind;
  quantity: number;
};

/** "2 Instagram reels", "1 YouTube Short". */
export function deliverableText({ platform, kind, quantity }: Deliverable) {
  return `${quantity} ${PLATFORM_RULES[platform].label} ${kindLabel(kind, quantity)}`;
}

export function isDeliverableKind(
  platform: Platform,
  kind: string,
): kind is DeliverableKind {
  return (DELIVERABLE_KINDS[platform] as readonly string[]).includes(kind);
}

// Statuses ---------------------------------------------------------------------------

export type CampaignStatus =
  | "draft"
  | "pending_review"
  | "open"
  | "paused"
  | "closed"
  | "in_progress"
  | "completed"
  | "cancelled";

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  pending_review: "Waiting for review",
  open: "Live",
  paused: "Paused",
  closed: "Closed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type CampaignAction =
  | "submit"
  | "withdraw"
  | "pause"
  | "resume"
  | "close"
  | "approve"
  | "reject"
  | "take_down";

export const BUSINESS_ACTIONS: readonly CampaignAction[] = [
  "submit",
  "withdraw",
  "pause",
  "resume",
  "close",
];

// Money ------------------------------------------------------------------------------

export const MIN_PRICE_NAIRA = 5_000;
export const MAX_PRICE_NAIRA = 100_000_000;
export const MAX_PLACES = 500;

/**
 * The most a business can spend: every place filled at the campaign price,
 * each with the business fee on top (CLAUDE.md §6.1). Creators can propose
 * other prices in Stage 5, so this is the ceiling at the listed price.
 */
export function maxSpend(priceKobo: number, places: number) {
  const { businessFeeKobo, businessPaysKobo } = feeExample(priceKobo);
  return {
    feePerCreatorKobo: businessFeeKobo,
    perCreatorKobo: businessPaysKobo,
    totalKobo: businessPaysKobo * places,
  };
}

/** What a creator receives at the listed price, after their fee. */
export function creatorReceivesKobo(priceKobo: number): number {
  return feeExample(priceKobo).influencerReceivesKobo;
}

function parsePrice(raw: string): { kobo: number } | { error: string } {
  const cleaned = raw.replace(/[₦,\s]/g, "").replace(/^ngn/i, "");
  if (cleaned === "") return { error: "Enter the price per creator." };
  if (!/^\d+$/.test(cleaned)) {
    return { error: "Enter a whole number of naira, like 50,000." };
  }
  const naira = Number(cleaned);
  if (naira < MIN_PRICE_NAIRA) {
    return {
      error: `The lowest price is ${formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA)}.`,
    };
  }
  if (naira > MAX_PRICE_NAIRA) {
    return {
      error: `Enter ${formatNaira(MAX_PRICE_NAIRA * KOBO_PER_NAIRA)} or less.`,
    };
  }
  return { kobo: naira * KOBO_PER_NAIRA };
}

// Dates -------------------------------------------------------------------------------
// Campaign dates are calendar days in Lagos, kept as "YYYY-MM-DD" strings.

const isoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in Lagos, "YYYY-MM-DD". */
export function lagosToday(now = new Date()): string {
  return isoDate.format(now);
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const dayFormat = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-20" → "20 Nov 2026". */
export const formatDay = (day: string) =>
  dayFormat.format(new Date(`${day}T00:00:00Z`));

// The campaign form ----------------------------------------------------------------------

export const TITLE_MAX = 100;
export const BRIEF_MAX = 3000;
export const GUIDELINES_MAX = 2000;
export const MAX_CAMPAIGN_NICHES = 5;
export const MAX_DELIVERABLE_LINES = 20;
export const MAX_QUANTITY = 20;
/** How far ahead a campaign can be planned. */
export const MAX_DAYS_AHEAD = 365;

export type CampaignInput = {
  title: string;
  brief: string;
  guidelines: string | null;
  niches: string[];
  /** Empty: anywhere in Nigeria. */
  states: NigerianState[];
  verifiedOnly: boolean;
  priceKobo: number;
  places: number;
  applicationsCloseOn: string;
  postFrom: string | null;
  deliverBy: string;
  platforms: { platform: Platform; minFollowers: FollowerRange | null }[];
  deliverables: Deliverable[];
};

export type CampaignField =
  | "title"
  | "brief"
  | "guidelines"
  | "niches"
  | "states"
  | "deliverables"
  | "minFollowers"
  | "price"
  | "places"
  | "applicationsCloseOn"
  | "postFrom"
  | "deliverBy";

const tidy = (raw: string) => raw.trim().replace(/[ \t]+/g, " ");

function contactProblem(value: string): string | null {
  const found = findContactDetails(value);
  return found
    ? `Remove the ${found}. Creators talk to you through Pitchype, which keeps the deal protected.`
    : null;
}

function wording(
  form: FormData,
  errors: FieldErrors<CampaignField>,
): { title: string; brief: string; guidelines: string | null } {
  const title = tidy(text(form, "title"));
  const brief = text(form, "brief").trim();
  const guidelines = text(form, "guidelines").trim();

  if (title.length < 5)
    errors.title = "Give it a title of at least 5 characters.";
  else if (title.length > TITLE_MAX)
    errors.title = `Use ${TITLE_MAX} characters or fewer.`;
  else if (contactProblem(title)) errors.title = contactProblem(title)!;

  if (brief.length < 20)
    errors.brief = "Describe the campaign in at least 20 characters.";
  else if (brief.length > BRIEF_MAX)
    errors.brief = `Use ${BRIEF_MAX} characters or fewer.`;
  else if (contactProblem(brief)) errors.brief = contactProblem(brief)!;

  if (guidelines.length > GUIDELINES_MAX)
    errors.guidelines = `Use ${GUIDELINES_MAX} characters or fewer.`;
  else if (contactProblem(guidelines))
    errors.guidelines = contactProblem(guidelines)!;

  return { title, brief, guidelines: guidelines === "" ? null : guidelines };
}

function places(form: FormData, errors: FieldErrors<CampaignField>): number {
  const raw = text(form, "places").trim();
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > MAX_PLACES) {
    errors.places = `Enter how many creators you want, from 1 to ${MAX_PLACES}.`;
  }
  return value;
}

/**
 * The full campaign form, for creating or editing a draft. `today` is Lagos
 * today ("YYYY-MM-DD"); `nicheSlugs` is the current niche list.
 */
export function parseCampaignForm(
  form: FormData,
  nicheSlugs: readonly string[],
  today: string,
): Parsed<CampaignInput, CampaignField> {
  const errors: FieldErrors<CampaignField> = {};
  const { title, brief, guidelines } = wording(form, errors);

  const niches = [
    ...new Set(form.getAll("niches").filter((v) => typeof v === "string")),
  ].filter((slug) => nicheSlugs.includes(slug));
  if (niches.length > MAX_CAMPAIGN_NICHES) {
    errors.niches = `Choose up to ${MAX_CAMPAIGN_NICHES} niches, or none for any niche.`;
  }

  const where = text(form, "where");
  const states =
    where === "states"
      ? [
          ...new Set(
            form.getAll("states").filter((v) => typeof v === "string"),
          ),
        ].filter(isNigerianState)
      : [];
  if (where === "states" && states.length === 0) {
    errors.states = "Choose at least one state, or anywhere in Nigeria.";
  }

  // Deliverable rows arrive as three parallel lists.
  const rowPlatforms = form.getAll("deliverablePlatform").map(String);
  const rowKinds = form.getAll("deliverableKind").map(String);
  const rowQuantities = form.getAll("deliverableQuantity").map(String);
  const deliverables: Deliverable[] = [];
  let badRow = false;
  rowPlatforms.forEach((platform, i) => {
    const kind = rowKinds[i] ?? "";
    const quantityRaw = (rowQuantities[i] ?? "").trim();
    if (platform === "" && kind === "" && quantityRaw === "") return; // empty row
    const quantity = Number(quantityRaw);
    if (
      !isPlatform(platform) ||
      !isDeliverableKind(platform, kind) ||
      !/^\d+$/.test(quantityRaw) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      badRow = true;
      return;
    }
    deliverables.push({ platform, kind, quantity });
  });
  if (badRow) {
    errors.deliverables = `Each line needs a platform, a type, and a number from 1 to ${MAX_QUANTITY}.`;
  } else if (deliverables.length === 0) {
    errors.deliverables = "Add at least one thing for creators to post.";
  } else if (deliverables.length > MAX_DELIVERABLE_LINES) {
    errors.deliverables = `Use ${MAX_DELIVERABLE_LINES} lines or fewer.`;
  }

  // One requirement per platform used, in a fixed order.
  const platforms = PLATFORMS.filter((p) =>
    deliverables.some((d) => d.platform === p),
  ).map((platform) => {
    const min = text(form, `minFollowers.${platform}`);
    if (min !== "" && !isFollowerRange(min)) {
      errors.minFollowers = "Choose a follower minimum from the list.";
    }
    return {
      platform,
      minFollowers: isFollowerRange(min) ? min : null,
    };
  });

  const price = parsePrice(text(form, "price"));
  if ("error" in price) errors.price = price.error;
  const placeCount = places(form, errors);

  const applicationsCloseOn = text(form, "applicationsCloseOn");
  const postFromRaw = text(form, "postFrom");
  const deliverBy = text(form, "deliverBy");
  const latest = addDays(today, MAX_DAYS_AHEAD);
  if (!isDay(applicationsCloseOn)) {
    errors.applicationsCloseOn = "Choose when applications close.";
  } else if (applicationsCloseOn < today) {
    errors.applicationsCloseOn = "Choose today or a later day.";
  } else if (applicationsCloseOn > latest) {
    errors.applicationsCloseOn = "Choose a day within the next year.";
  }
  if (!isDay(deliverBy)) {
    errors.deliverBy = "Choose the day posts must be up by.";
  } else if (isDay(applicationsCloseOn) && deliverBy < applicationsCloseOn) {
    errors.deliverBy = "Make this on or after the day applications close.";
  } else if (deliverBy > addDays(latest, 90)) {
    errors.deliverBy = "Choose a day within the next 15 months.";
  }
  if (postFromRaw !== "") {
    if (!isDay(postFromRaw) || postFromRaw < today) {
      errors.postFrom = "Choose today or a later day, or leave it empty.";
    } else if (isDay(deliverBy) && postFromRaw > deliverBy) {
      errors.postFrom = "Make this on or before the deliver-by day.";
    }
  }

  const values = {
    title,
    brief,
    guidelines: guidelines ?? "",
    niches: niches.join(","),
    states: states.join(","),
    price: text(form, "price").trim(),
    places: text(form, "places").trim(),
    applicationsCloseOn,
    postFrom: postFromRaw,
    deliverBy,
  };
  if (Object.keys(errors).length > 0 || "error" in price) {
    return { ok: false, errors, values };
  }
  return {
    ok: true,
    value: {
      title,
      brief,
      guidelines,
      niches,
      states,
      verifiedOnly: text(form, "verifiedOnly") === "on",
      priceKobo: price.kobo,
      places: placeCount,
      applicationsCloseOn,
      postFrom: postFromRaw === "" ? null : postFromRaw,
      deliverBy,
      platforms,
      deliverables,
    },
  };
}

export type LiveEdit = {
  title: string;
  brief: string;
  guidelines: string | null;
  places: number;
  applicationsCloseOn: string;
  deliverBy: string;
};

/**
 * What can change once a campaign is live: wording, places, and the two
 * deadlines (later only). Everything else is locked (and the database
 * refuses it anyway).
 */
export function parseLiveEditForm(
  form: FormData,
  current: { applicationsCloseOn: string; deliverBy: string },
): Parsed<LiveEdit, CampaignField> {
  const errors: FieldErrors<CampaignField> = {};
  const { title, brief, guidelines } = wording(form, errors);
  const placeCount = places(form, errors);
  const applicationsCloseOn = text(form, "applicationsCloseOn");
  const deliverBy = text(form, "deliverBy");

  if (
    !isDay(applicationsCloseOn) ||
    applicationsCloseOn < current.applicationsCloseOn
  ) {
    errors.applicationsCloseOn = `Keep it on or after ${formatDay(current.applicationsCloseOn)}: deadlines can only move later.`;
  }
  if (!isDay(deliverBy) || deliverBy < current.deliverBy) {
    errors.deliverBy = `Keep it on or after ${formatDay(current.deliverBy)}: deadlines can only move later.`;
  } else if (isDay(applicationsCloseOn) && deliverBy < applicationsCloseOn) {
    errors.deliverBy = "Make this on or after the day applications close.";
  }

  const values = {
    title,
    brief,
    guidelines: guidelines ?? "",
    places: text(form, "places").trim(),
    applicationsCloseOn,
    deliverBy,
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return {
    ok: true,
    value: {
      title,
      brief,
      guidelines,
      places: placeCount,
      applicationsCloseOn,
      deliverBy,
    },
  };
}

// Why a creator doesn't qualify ------------------------------------------------------------

export type Problem =
  | { code: "no_profile" }
  | { code: "missing_platform"; platform: Platform }
  | { code: "followers"; platform: Platform; minFollowers: FollowerRange }
  | { code: "not_verified"; platform: Platform }
  | { code: "niche" }
  | { code: "state" };

/** One plain sentence per problem, e.g. "Needs 10K or more Instagram followers." */
export function problemText(
  problem: Problem,
  campaign: { nicheNames: string[]; states: NigerianState[] },
): string {
  switch (problem.code) {
    case "no_profile":
      return "Set up your creator profile first.";
    case "missing_platform":
      return `Add your ${PLATFORM_RULES[problem.platform].label} account to your profile.`;
    case "followers":
      return `Needs ${MIN_FOLLOWER_LABELS[problem.minFollowers]} ${PLATFORM_RULES[problem.platform].label} followers.`;
    case "not_verified":
      return `Needs your ${PLATFORM_RULES[problem.platform].label} account verified.`;
    case "niche":
      return `For ${listWithOr(campaign.nicheNames.map((n) => n.toLowerCase()))} creators.`;
    case "state":
      return `For creators in ${listWithOr(campaign.states.map(stateLabel))}.`;
  }
}

function listWithOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
