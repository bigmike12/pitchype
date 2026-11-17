// The Kanban boards: which column an application sits in, for the business's
// hiring board and the creator's "Your work" board. A card's column is read
// from what has really happened (a decision, a payment, work starting, a
// release); nothing here moves anything. No framework imports, so it can be
// unit-tested.

import { hireEndedUnpaid } from "./applications.ts";
import {
  FOLLOWER_RANGE_LABELS,
  PLATFORM_RULES,
  type FollowerRange,
  type PlatformListing,
} from "./creator-profile.ts";

type BoardApplication = {
  status: string;
  engagement: { status: string; fundedAt: string | null } | null;
};

/** Where a hire that exists and hasn't ended unpaid stands. */
type HireStage =
  | "to_pay"
  | "in_progress"
  | "to_review"
  | "changes"
  | "disputed"
  | "completed"
  | "closed";

function hireStage(engagementStatus: string): HireStage {
  switch (engagementStatus) {
    case "awaiting_payment":
      return "to_pay";
    case "funded":
    case "in_progress":
      return "in_progress";
    case "submitted":
      return "to_review";
    case "denied":
      return "changes";
    case "disputed":
      return "disputed";
    case "accepted":
    case "auto_released":
    case "paid_out":
      return "completed";
    default:
      // cancelled after paying, or refunded.
      return "closed";
  }
}

export const BUSINESS_COLUMNS = [
  { key: "applied", label: "Applied", hint: "New, waiting for you" },
  { key: "shortlisted", label: "Shortlisted", hint: "Your maybes" },
  { key: "to_pay", label: "To pay", hint: "Hired, not yet paid" },
  { key: "in_progress", label: "In progress", hint: "Paid, held by Pitchype" },
  { key: "to_review", label: "To review", hint: "Work submitted" },
  { key: "changes", label: "Changes asked", hint: "Waiting for the creator" },
  { key: "disputed", label: "In dispute", hint: "With Pitchype" },
  { key: "completed", label: "Completed", hint: "Payment released" },
] as const;

export type BusinessColumn =
  (typeof BUSINESS_COLUMNS)[number]["key"] | "closed";

/**
 * The hiring board's column for one application. A hire that ended without
 * being paid for goes back to "applied": the place is open again and the
 * business decides again (the same rule as `applicationBucket`).
 */
export function businessColumn(application: BoardApplication): BusinessColumn {
  if (application.status === "submitted") return "applied";
  if (application.status === "shortlisted") return "shortlisted";
  if (hireEndedUnpaid(application)) return "applied";
  if (application.status === "approved" && application.engagement) {
    return hireStage(application.engagement.status);
  }
  return "closed";
}

export const CREATOR_COLUMNS = [
  { key: "applied", label: "Applied", hint: "Waiting for the business" },
  { key: "hired", label: "Hired", hint: "Waiting for payment" },
  { key: "ready", label: "Ready to start", hint: "Paid and held by Pitchype" },
  { key: "in_progress", label: "In progress", hint: "You’re working on these" },
  { key: "to_review", label: "To review", hint: "Waiting for the business" },
  { key: "changes", label: "Changes asked", hint: "Fix and resubmit" },
  { key: "disputed", label: "In dispute", hint: "With Pitchype" },
  { key: "paid", label: "Paid", hint: "In your wallet" },
] as const;

export type CreatorColumn = (typeof CREATOR_COLUMNS)[number]["key"] | "closed";

/**
 * The creator's column for one application. A hire that ended unpaid is
 * closed here: nothing is running, though they can apply again from the
 * campaign.
 */
export function creatorColumn(application: BoardApplication): CreatorColumn {
  if (
    application.status === "submitted" ||
    application.status === "shortlisted"
  ) {
    return "applied";
  }
  if (hireEndedUnpaid(application)) return "closed";
  if (application.status === "approved" && application.engagement) {
    if (application.engagement.status === "funded") return "ready";
    const stage = hireStage(application.engagement.status);
    if (stage === "to_pay") return "hired";
    if (stage === "completed") return "paid";
    return stage;
  }
  return "closed";
}

/**
 * The column a phone shows first (one at a time): the one asked for if it is
 * a real column, otherwise the first that has cards, otherwise the first.
 */
export function shownColumn<K extends string>(
  columns: readonly { key: K }[],
  counts: ReadonlyMap<K, number>,
  requested: string | undefined,
): K {
  const asked = columns.find((c) => c.key === requested);
  if (asked) return asked.key;
  const filled = columns.find((c) => (counts.get(c.key) ?? 0) > 0);
  return (filled ?? columns[0]).key;
}

/** What the board's search box and people row narrow the cards to. */
export type BoardFilter = {
  /** Trimmed search text; matched against each card's text, ignoring case. */
  search: string | undefined;
  /** The one person picked in the people row, by id. */
  person: string | undefined;
};

/** What a card carries for filtering: whose it is, and its searchable text. */
export type BoardCardKey = { personId: string; text: string[] };

/** Whether a card passes the picked person and the search (both optional). */
export function matchesBoardFilter(
  card: BoardCardKey,
  filter: BoardFilter,
): boolean {
  if (filter.person && card.personId !== filter.person) return false;
  if (!filter.search) return true;
  const needle = filter.search.toLocaleLowerCase();
  return card.text.some((text) => text.toLocaleLowerCase().includes(needle));
}

/** One entry per person, in the order each first appears on the board. */
export function uniquePeople<T extends { id: string }>(people: T[]): T[] {
  return [...new Map(people.map((person) => [person.id, person])).values()];
}

// The bottom of each self-reported range, to tell which platform is biggest.
const RANGE_FLOOR: Record<FollowerRange, number> = {
  "1k_5k": 1_000,
  "5k_10k": 5_000,
  "10k_50k": 10_000,
  "50k_100k": 50_000,
  "100k_plus": 100_000,
};

const size = (p: PlatformListing) =>
  p.verifiedFollowerCount ??
  (p.followerRange ? RANGE_FLOOR[p.followerRange] : 0);

/** 12400 → "12.4K", for the tight space on cards. */
const compact = (count: number) =>
  new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);

/**
 * The one line under a creator's name on a hiring card, like the landing
 * page's: "Food and drinks · Instagram · 5K–10K". It names their first niche
 * and their biggest platform, with its verified count or self-reported range.
 */
export function creatorDetailLine(
  platforms: PlatformListing[],
  nicheNames: string[],
): string {
  const top = platforms.reduce<PlatformListing | null>(
    (best, p) => (best === null || size(p) > size(best) ? p : best),
    null,
  );
  const followers = !top
    ? null
    : top.verified && top.verifiedFollowerCount !== null
      ? compact(top.verifiedFollowerCount)
      : top.followerRange
        ? FOLLOWER_RANGE_LABELS[top.followerRange]
        : null;
  return [nicheNames[0], top && PLATFORM_RULES[top.platform].label, followers]
    .filter(Boolean)
    .join(" · ");
}
