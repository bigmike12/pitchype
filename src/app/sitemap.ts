import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { listIndexableCreators } from "@/lib/db/creators";
import { SITE_URL } from "@/lib/site";

// The landing page, plus the creator directory once anyone is in it. Built
// per request so a newly published profile shows up straight away. /privacy
// and /terms are drafts marked noindex; add them once they're published.
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
  if (creators.length === 0) return [home];

  return [
    home,
    { url: `${SITE_URL}/creators`, changeFrequency: "daily", priority: 0.8 },
    ...creators.map((creator) => ({
      url: `${SITE_URL}/creators/${creator.slug}`,
      lastModified: creator.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
