import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Signed-in areas and the API stay out of search. They're also marked noindex
// in the page metadata, but a crawler can only see that if it's allowed in.
const PRIVATE_PATHS = [
  "/admin",
  "/account",
  "/applications",
  "/business",
  "/campaigns",
  "/home",
  "/inbox",
  "/onboarding",
  "/profile",
  "/wallet",
  "/api/",
  "/auth/",
  // Creators' tracked links: a crawler following one would only add noise.
  "/r/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
