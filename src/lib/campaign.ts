// Campaigns: deliverable types, form rules, money shown to each side, and
// why a creator doesn't qualify. No framework imports, so it can be
// unit-tested. Mirrors supabase/migrations/20261109162551_create_campaigns.sql;
// decisions in docs/campaign-spec-decisions.md.

import {
  checkpointDates,
  isEvidenceType,
  isFinalRequirement,
  isValidInterval,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  PRESET_INTERVALS,
  type EvidenceType,
  type FinalRequirement,
} from "./checkpoints.ts";
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

/** The tabs on a business's campaign list, and which statuses each holds. */
export const CAMPAIGN_GROUPS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "drafts", label: "Drafts" },
  { key: "ended", label: "Ended" },
] as const;

export type CampaignGroup = Exclude<
  (typeof CAMPAIGN_GROUPS)[number]["key"],
  "all"
>;

/**
 * Live is anything creators can still act on or that has work running
 * (paused included: it comes back); drafts are not published yet.
 */
export function campaignGroup(status: CampaignStatus): CampaignGroup {
  switch (status) {
    case "draft":
    case "pending_review":
      return "drafts";
    case "open":
    case "paused":
    case "in_progress":
      return "live";
    case "closed":
    case "completed":
    case "cancelled":
      return "ended";
  }
}

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

/** How full a campaign is, in words: "1 of 3 filled" and "2 still needed". */
export function placesStatus(places: number, taken: number) {
  const left = Math.max(places - taken, 0);
  return {
    left,
    filled: `${taken} of ${places} filled`,
    needed: left === 0 ? "All places filled" : `${left} still needed`,
  };
}

/**
 * What a creator reads about places: how many are left once any are taken
 * ("2 of 3 places left"), else just how many creators are wanted. `taken` is
 * null when the database doesn't say.
 */
export function placesLeftText(places: number, taken: number | null): string {
  if (taken === null || taken <= 0) {
    return `${places} ${places === 1 ? "creator" : "creators"}`;
  }
  const { left } = placesStatus(places, taken);
  if (left === 0) return "All places filled";
  return `${left} of ${places} ${places === 1 ? "place" : "places"} left`;
}

/** What a creator receives at the listed price, after their fee. */
export function creatorReceivesKobo(priceKobo: number): number {
  return feeExample(priceKobo).influencerReceivesKobo;
}

/** Whole naira from ₦5,000 (MIN_PRICE_NAIRA) to MAX_PRICE_NAIRA; used for campaign prices and proposals. */
export function parsePrice(raw: string): { kobo: number } | { error: string } {
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

// Pay per click -----------------------------------------------------------------------
// Mirrors supabase/migrations/20261119100000_per_click_campaigns.sql; decisions
// in docs/superpowers/specs/2026-11-18-pay-per-click-design.md.

export type PaymentModel = "fixed" | "per_click";

/** Where a creator may be told not to share a tracked link. */
export type Channel =
  | "whatsapp"
  | "telegram"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "x"
  | "youtube"
  | "snapchat";

export const CHANNELS: readonly Channel[] = [
  "whatsapp",
  "telegram",
  "facebook",
  "instagram",
  "tiktok",
  "x",
  "youtube",
  "snapchat",
];

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  snapchat: "Snapchat",
};

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export const MIN_CPC_NAIRA = 50;
const MAX_DESTINATION_LENGTH = 2_000;

// Shorteners hide where a link really goes, so they can't be a destination.
const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "ow.ly",
  "buff.ly",
  "shorturl.at",
  "rb.gy",
  "tiny.cc",
  "s.id",
  "t.ly",
]);

/** A destination a business may promote: https, a real host, no shortener. */
export function checkDestinationUrl(
  raw: string,
): { url: string } | { error: string } {
  const value = raw.trim();
  if (value === "")
    return { error: "Enter the link you want people to visit." };
  if (value.length > MAX_DESTINATION_LENGTH) {
    return {
      error: `Use a link of ${MAX_DESTINATION_LENGTH} characters or fewer.`,
    };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "Enter a full link, starting with https://" };
  }
  if (url.protocol !== "https:") {
    return { error: "Use a secure link, starting with https://" };
  }
  if (url.username !== "" || url.password !== "" || url.port !== "") {
    return { error: "Use a plain link, without a port or a login." };
  }
  const host = url.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  if (isIp || host === "localhost" || !host.includes(".")) {
    return { error: "Use your website's address, not an IP address." };
  }
  if (SHORTENERS.has(host.replace(/^www\./, ""))) {
    return {
      error:
        "Use the full link, not a shortened one. Pitchype makes each creator's short link.",
    };
  }
  // Stored as the parser writes it: percent-encoded (so it's a valid
  // Location header) and with the scheme spelled https://, which the database
  // constraint checks.
  if (url.href.length > MAX_DESTINATION_LENGTH) {
    return {
      error: `Use a link of ${MAX_DESTINATION_LENGTH} characters or fewer.`,
    };
  }
  return { url: url.href };
}

/** How many clicks a creator's budget pays for. */
export function maxClicks(budgetKobo: number, cpcKobo: number): number {
  return Math.floor(budgetKobo / cpcKobo);
}

/**
 * What a per-click rate means for a creator, from the numbers the business
 * typed. Exact arithmetic only: there is no market rate here until Pitchype
 * has enough campaign history of its own to state one honestly (CLAUDE.md §3).
 */
export function perClickGuidance(budgetKobo: number, cpcKobo: number) {
  const takeHomeKobo = creatorReceivesKobo(budgetKobo);
  return {
    /** Clicks a creator must send to earn the whole budget. */
    clicks: maxClicks(budgetKobo, cpcKobo),
    /** What a creator keeps of the budget if they send all of them. */
    takeHomeKobo,
    creatorFeeKobo: budgetKobo - takeHomeKobo,
    /** The lowest rate we allow. */
    atMinimum: cpcKobo <= MIN_CPC_NAIRA * KOBO_PER_NAIRA,
  };
}

/**
 * The whole-naira rates (₦50 and up) that fit a budget in whole clicks,
 * nearest below and above a rate that doesn't, so a creator can be told what
 * to try. Null when there is none on that side.
 */
export function fittingRatesNear(
  budgetKobo: number,
  rateKobo: number,
): { below: number | null; above: number | null } {
  const budgetNaira = budgetKobo / KOBO_PER_NAIRA;
  const target = rateKobo / KOBO_PER_NAIRA;
  let below: number | null = null;
  let above: number | null = null;
  for (let d = 1; d * d <= budgetNaira; d++) {
    if (budgetNaira % d !== 0) continue;
    for (const rate of [d, budgetNaira / d]) {
      if (rate < MIN_CPC_NAIRA) continue;
      if (rate <= target && (below === null || rate > below)) below = rate;
      if (rate >= target && (above === null || rate < above)) above = rate;
    }
  }
  return {
    below: below === null ? null : below * KOBO_PER_NAIRA,
    above: above === null ? null : above * KOBO_PER_NAIRA,
  };
}

function parseCpc(raw: string): { kobo: number } | { error: string } {
  const cleaned = raw.replace(/[₦,\s]/g, "");
  if (cleaned === "") return { error: "Enter what you pay per click." };
  if (!/^\d+$/.test(cleaned)) {
    return { error: "Enter a whole number of naira, like 50." };
  }
  const naira = Number(cleaned);
  if (naira < MIN_CPC_NAIRA) {
    return { error: `The lowest price per click is ₦${MIN_CPC_NAIRA}.` };
  }
  if (naira > MAX_PRICE_NAIRA) {
    return {
      error: `Enter ${formatNaira(MAX_PRICE_NAIRA * KOBO_PER_NAIRA)} or less.`,
    };
  }
  return { kobo: naira * KOBO_PER_NAIRA };
}

type PerClickTerms = {
  paymentModel: PaymentModel;
  cpcKobo: number | null;
  destinationUrl: string | null;
  utmTags: boolean;
  blockedChannels: Channel[];
};

function perClickTerms(
  form: FormData,
  priceKobo: number | null,
  errors: FieldErrors<CampaignField>,
): PerClickTerms {
  if (text(form, "payment_model") !== "per_click") {
    return {
      paymentModel: "fixed",
      cpcKobo: null,
      destinationUrl: null,
      utmTags: true,
      blockedChannels: [],
    };
  }

  const cpc = parseCpc(text(form, "cpc"));
  if ("error" in cpc) errors.cpc = cpc.error;
  else if (priceKobo !== null && !errors.price && priceKobo % cpc.kobo !== 0) {
    errors.price = `Make the budget a whole number of clicks: a multiple of ${formatNaira(cpc.kobo)}.`;
  }

  const destination = checkDestinationUrl(text(form, "destination_url"));
  if ("error" in destination) errors.destinationUrl = destination.error;

  const posted = [
    ...new Set(
      form.getAll("blocked_channels").filter((v) => typeof v === "string"),
    ),
  ];
  if (posted.some((v) => !isChannel(v))) {
    errors.blockedChannels = "Choose channels from the list.";
  }

  return {
    paymentModel: "per_click",
    cpcKobo: "kobo" in cpc ? cpc.kobo : null,
    destinationUrl: "url" in destination ? destination.url : null,
    utmTags: text(form, "utm_tags") === "on",
    blockedChannels: posted.filter(isChannel),
  };
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

/**
 * Whether a per-click campaign's clicks have stopped: they count until the
 * end of the deliver-by day, Lagos time (click_window_end() in the database).
 */
export function clickWindowEnded(deliverBy: string, now = new Date()): boolean {
  return lagosToday(now) > deliverBy;
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
  /** The day the campaign ends: posts stay up until then. */
  endsOn: string | null;
  /** Fixed checkpoints after the start; off by default. */
  checkpointsEnabled: boolean;
  checkpointIntervalDays: number | null;
  checkpointEvidence: EvidenceType[];
  /** What the final submission must contain; empty means a link or a screenshot. */
  finalRequirements: FinalRequirement[];
  platforms: { platform: Platform; minFollowers: FollowerRange | null }[];
  deliverables: Deliverable[];
  /** For per-click campaigns `priceKobo` is the budget per creator. */
  paymentModel: PaymentModel;
  cpcKobo: number | null;
  destinationUrl: string | null;
  utmTags: boolean;
  blockedChannels: Channel[];
};

export type CampaignField =
  | "cpc"
  | "destinationUrl"
  | "blockedChannels"
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
  | "deliverBy"
  | "endsOn"
  | "checkpointInterval"
  | "checkpointEvidence"
  | "finalRequirements";

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
 * The checkpoint switch, frequency and evidence. Mirrors the database: a
 * schedule needs a start date and at least one date before final delivery
 * (generate_campaign_checkpoints(), checkpoints_do_not_fit). Settings left
 * over from a switch that is now off are dropped.
 */
function checkpointSettings(
  form: FormData,
  context: {
    postFrom: string;
    deliverBy: string;
    errors: FieldErrors<CampaignField>;
  },
): Pick<
  CampaignInput,
  "checkpointsEnabled" | "checkpointIntervalDays" | "checkpointEvidence"
> {
  const off = {
    checkpointsEnabled: false,
    checkpointIntervalDays: null,
    checkpointEvidence: [],
  };
  if (text(form, "checkpointsEnabled") !== "on") return off;

  const { postFrom, deliverBy, errors } = context;
  const frequency = text(form, "checkpointFrequency");
  const raw =
    frequency === "custom"
      ? text(form, "checkpointCustomDays").trim()
      : frequency;
  const days = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  const presets: readonly number[] = PRESET_INTERVALS;
  if (
    !isValidInterval(days) ||
    (frequency !== "custom" && !presets.includes(days))
  ) {
    errors.checkpointInterval = `Choose how often, or a custom interval from ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS} days.`;
  }

  const evidence = [
    ...new Set(form.getAll("checkpointEvidence").filter(isEvidenceType)),
  ];
  if (evidence.length === 0) {
    errors.checkpointEvidence = "Choose what each checkpoint needs.";
  }

  if (!isDay(postFrom)) {
    // Without a start date there is nothing to count from. (An invalid date
    // already has its own message.)
    errors.postFrom ??= "Checkpoints count from the start date, so choose one.";
  } else if (
    !errors.checkpointInterval &&
    isDay(deliverBy) &&
    checkpointDates({ postFrom, deliverBy, intervalDays: days }).length === 0
  ) {
    errors.checkpointInterval =
      "With these dates there is no room for a checkpoint before final delivery. Shorten the interval or turn checkpoints off.";
  }

  return {
    checkpointsEnabled: true,
    checkpointIntervalDays: isValidInterval(days) ? days : null,
    checkpointEvidence: evidence,
  };
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
  const terms = perClickTerms(
    form,
    "kobo" in price ? price.kobo : null,
    errors,
  );

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

  const endsOnRaw = text(form, "endsOn");
  if (endsOnRaw !== "") {
    if (!isDay(endsOnRaw)) {
      errors.endsOn = "Choose the day the campaign ends.";
    } else if (isDay(deliverBy) && endsOnRaw < deliverBy) {
      errors.endsOn = "Make this on or after the final delivery day.";
    } else if (endsOnRaw > addDays(latest, 180)) {
      errors.endsOn = "Choose a day within the next 18 months.";
    }
  }

  const checkpoints = checkpointSettings(form, {
    postFrom: postFromRaw,
    deliverBy,
    errors,
  });
  const finalRequirements = [
    ...new Set(form.getAll("finalRequirements").filter(isFinalRequirement)),
  ];
  if (terms.paymentModel === "per_click" && finalRequirements.length > 0) {
    errors.finalRequirements =
      "Pay-per-click campaigns have no final submission, so there is nothing to require.";
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
    endsOn: endsOnRaw,
    cpc: text(form, "cpc").trim(),
    destinationUrl: text(form, "destination_url").trim(),
    blockedChannels: terms.blockedChannels.join(","),
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
      endsOn: endsOnRaw === "" ? null : endsOnRaw,
      ...checkpoints,
      finalRequirements,
      platforms,
      deliverables,
      ...terms,
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
  /** Undefined: leave the end date as it is. */
  endsOn?: string;
};

/**
 * What can change once a campaign is live: wording, places, and the two
 * deadlines (later only). Everything else is locked (and the database
 * refuses it anyway).
 */
export function parseLiveEditForm(
  form: FormData,
  current: {
    applicationsCloseOn: string;
    deliverBy: string;
    endsOn?: string | null;
  },
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

  // The end date moves later like the other dates, and never before final delivery.
  const endsOnRaw = text(form, "endsOn");
  if (endsOnRaw !== "") {
    if (!isDay(endsOnRaw) || (current.endsOn && endsOnRaw < current.endsOn)) {
      errors.endsOn = current.endsOn
        ? `Keep it on or after ${formatDay(current.endsOn)}: deadlines can only move later.`
        : "Choose the day the campaign ends.";
    } else if (isDay(deliverBy) && endsOnRaw < deliverBy) {
      errors.endsOn = "Make this on or after the final delivery day.";
    }
  } else if (current.endsOn && isDay(deliverBy) && deliverBy > current.endsOn) {
    errors.endsOn =
      "Move the end date later too: it can't be before final delivery.";
  }

  const values = {
    title,
    brief,
    guidelines: guidelines ?? "",
    places: text(form, "places").trim(),
    applicationsCloseOn,
    deliverBy,
    endsOn: endsOnRaw,
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
      ...(endsOnRaw === "" ? {} : { endsOn: endsOnRaw }),
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
