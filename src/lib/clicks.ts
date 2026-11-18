// Tracked-link hits: what kind of visitor this is, which channel it came from,
// the destination with tracking tags, and the visitor's hash. Pure, so the
// redirect's decisions can be unit-tested; record_click() in the database
// decides what is billable. Design: docs/superpowers/specs/2026-11-18-pay-per-click-design.md §6.

import { createHmac } from "node:crypto";

import type { Channel } from "./campaign.ts";

export type ClickSource = Channel | "other_site" | "unknown";
export type ClientClass = "human" | "preview" | "bot";

/** Seven letters or digits, as the database makes them. */
export const LINK_CODE = /^[0-9A-Za-z]{7}$/;

// Apps that fetch a link to draw its preview card. Checked before bots,
// because several of them say "bot" in their name.
const PREVIEW_AGENTS =
  /WhatsApp|TelegramBot|facebookexternalhit|Facebot|Twitterbot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|Applebot|Pinterestbot|redditbot|Embedly/i;
const BOT_AGENTS =
  /bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|headless/i;

/** A preview fetch, an automated visitor, or (as far as we can tell) a person. */
export function classifyClient(
  method: string,
  userAgent: string | null,
  headers: { purpose: string | null; secPurpose: string | null },
): ClientClass {
  if (method.toUpperCase() === "HEAD") return "preview";
  if (
    headers.purpose?.toLowerCase().includes("prefetch") ||
    headers.secPurpose?.toLowerCase().includes("prefetch")
  ) {
    return "preview";
  }
  if (!userAgent) return "bot";
  if (PREVIEW_AGENTS.test(userAgent)) return "preview";
  if (BOT_AGENTS.test(userAgent)) return "bot";
  return "human";
}

// Host suffix → channel. A host matches itself or any subdomain.
const REFERRER_CHANNELS: [string, Channel][] = [
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["instagram.com", "instagram"],
  ["t.co", "x"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["t.me", "telegram"],
  ["telegram.org", "telegram"],
  ["whatsapp.com", "whatsapp"],
  ["wa.me", "whatsapp"],
  ["tiktok.com", "tiktok"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["snapchat.com", "snapchat"],
];

// In-app browsers and preview fetchers name their app in the user agent; this
// is how a click with no referrer can still be placed.
const AGENT_CHANNELS: [RegExp, Channel][] = [
  [/Instagram/i, "instagram"],
  [/FBAN|FBAV|FB_IAB|facebookexternalhit|Facebot/i, "facebook"],
  [/BytedanceWebview|musical_ly|TikTok/i, "tiktok"],
  [/Snapchat/i, "snapchat"],
  [/WhatsApp/i, "whatsapp"],
  [/Telegram/i, "telegram"],
  [/Twitterbot/i, "x"],
];

// Chrome on Android reports a link opened from an app as
// android-app://<package>/, with no web referrer.
const ANDROID_APPS: Record<string, Channel> = {
  "com.whatsapp": "whatsapp",
  "com.whatsapp.w4b": "whatsapp",
  "org.telegram.messenger": "telegram",
  "org.thunderdog.challegram": "telegram",
  "com.facebook.katana": "facebook",
  "com.facebook.lite": "facebook",
  "com.facebook.orca": "facebook",
  "com.instagram.android": "instagram",
  "com.zhiliaoapp.musically": "tiktok",
  "com.ss.android.ugc.trill": "tiktok",
  "com.twitter.android": "x",
  "com.google.android.youtube": "youtube",
  "com.snapchat.android": "snapchat",
};

/** Only the host of the referrer is kept, never its path or query. */
export function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** The channel a hit came from, from its referrer or else its user agent. */
export function clickSource(
  referrer: string | null,
  userAgent: string | null,
): ClickSource {
  const host = referrerHost(referrer);
  if (host && referrer?.toLowerCase().startsWith("android-app:")) {
    return ANDROID_APPS[host] ?? "other_site";
  }
  if (host) {
    const match = REFERRER_CHANNELS.find(
      ([suffix]) => host === suffix || host.endsWith(`.${suffix}`),
    );
    return match ? match[1] : "other_site";
  }
  if (userAgent) {
    const match = AGENT_CHANNELS.find(([pattern]) => pattern.test(userAgent));
    if (match) return match[1];
  }
  return "unknown";
}

/** The business's link, with utm tags added (replacing any already there). */
export function destinationWithTags(
  destination: string,
  opts: { utmTags: boolean; campaignId: string; code: string },
): string {
  const url = new URL(destination);
  // href is percent-encoded, so it is always a valid Location header.
  if (!opts.utmTags) return url.href;
  url.searchParams.set("utm_source", "pitchype");
  url.searchParams.set("utm_medium", "creator");
  url.searchParams.set("utm_campaign", opts.campaignId);
  url.searchParams.set("utm_content", opts.code);
  return url.toString();
}

// Keyed hashes: the IPv4 space is small enough to reverse a plain hash, and raw
// IPs are never stored (NDPR).
export function hashVisitor(
  secret: string,
  ip: string,
  userAgent: string,
): string {
  return createHmac("sha256", secret)
    .update(`${ip}|${userAgent}`)
    .digest("hex");
}

export function hashUserAgent(secret: string, userAgent: string): string {
  return createHmac("sha256", secret).update(userAgent).digest("hex");
}
