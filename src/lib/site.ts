export const SITE_NAME = "Pitchype";

// Absolute URL for canonical links, the sitemap, robots.txt and social cards.
// Falls back to Vercel's production domain so a missing env var never ships
// localhost canonicals, then to localhost for development.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3030")
).replace(/\/+$/, "");

// Placeholder until the real inbox is confirmed.
export const CONTACT_EMAIL = "hello@pitchype.com";

// Official profiles: footer links, the JSON-LD `sameAs` list and the X card.
// Keep these as clean profile URLs, without share-sheet tracking parameters.
export const SOCIAL_PROFILES = [
  { label: "LinkedIn", url: "https://www.linkedin.com/company/pitchype" },
  { label: "X (Twitter)", url: "https://x.com/pitchype" },
  { label: "Instagram", url: "https://www.instagram.com/pitchype" },
] as const;

export const X_HANDLE = "@pitchype";

export const SITE_DESCRIPTION =
  "Pitchype connects Nigerian businesses with micro and nano creators. Post a campaign, choose the creators you like, and pay through escrow: the money is held until the work is approved.";
