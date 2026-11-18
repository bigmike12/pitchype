// Words for tracked-link clicks on the hire and campaign pages. Mirrors the
// filter reasons in supabase/migrations/20261119100100_tracked_links.sql.

import { CHANNEL_LABELS, type Channel } from "./campaign.ts";

export const FILTER_REASONS = [
  "preview",
  "bot",
  "blocked_channel",
  "hire_ended",
  "window_closed",
  "cap_reached",
  "repeat",
  "rate_limited",
] as const;

export type FilterReason = (typeof FILTER_REASONS)[number];

export function isFilterReason(value: string): value is FilterReason {
  return (FILTER_REASONS as readonly string[]).includes(value);
}

const REASON_TEXT: Record<FilterReason, string> = {
  preview: "Link preview, not a person",
  bot: "Automated visitor",
  blocked_channel: "From a channel this campaign blocks",
  hire_ended: "After the job ended",
  window_closed: "After the campaign ended",
  cap_reached: "After the click limit",
  repeat: "Same person within 24 hours",
  rate_limited: "Too many hits at once",
};

export function filterReasonText(reason: FilterReason): string {
  return REASON_TEXT[reason];
}

/**
 * Worded as what we saw, not as proof: a preview fetch names its app in the
 * user agent, which anyone can fake.
 */
export function blockedShareWarning(channel: Channel): string {
  const name = CHANNEL_LABELS[channel];
  const article = /^[AEIOU]/.test(name) ? "An" : "A";
  return `${article} ${name} link preview opened this link, and this campaign blocks ${name}`;
}
