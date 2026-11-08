import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Only the landing page for now. /privacy and /terms are drafts marked
// noindex; add them here once they've been reviewed and published.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
