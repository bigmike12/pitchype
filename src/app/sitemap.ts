import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { listIndexableCreators } from "@/lib/db/creators";
import { SITE_URL } from "@/lib/site";
import { BUSINESS_PAGE, CREATOR_PAGE } from "@/lib/signup-link";

// The landing page, the two audience pages, the creator directory, and each
// creator who may be indexed.
// Built per request so a newly published profile shows up straight away.
// /privacy and /terms are drafts marked noindex; add them once they're
// published.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const home = {
    url: `${SITE_URL}/`,
    changeFrequency: "weekly",
    priority: 1,
  } as const;

  let creators: { slug: string; updatedAt: string }[] = [];
  try {
    creators = await listIndexableCreators();
  } catch (error) {
    // A database hiccup shouldn't take the whole sitemap down.
    console.error(
      "sitemap: creators lookup failed",
      error instanceof Error ? error.message : error,
    );
  }
  // The directory page is listed even while it's empty, so the search engines
  // find it from the start (docs/TODO.md).
  return [
    home,
    ...[BUSINESS_PAGE, CREATOR_PAGE].map((page) => ({
      url: `${SITE_URL}${page}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/creators`, changeFrequency: "daily", priority: 0.8 },
    {
      url: `${SITE_URL}/how-escrow-works`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...creators.map((creator) => ({
      url: `${SITE_URL}/creators/${creator.slug}`,
      lastModified: creator.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
