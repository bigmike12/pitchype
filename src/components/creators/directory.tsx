import { Search } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DIRECTORY_PAGE_SIZE,
  directoryQuery,
  hasActiveFilters,
  parseDirectoryFilters,
} from "@/lib/creator-profile";
import { listNiches, searchCreators } from "@/lib/db/creators";
import type { AppUser } from "@/lib/db/users";

import { CreatorCard } from "./creator-card";
import { DirectoryFilters, type DirectoryBase } from "./directory-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The creator directory's filters, results and paging, for the public page
 * and the one inside the business portal. Every link stays under
 * `basePath`. The database decides what each viewer may see; this only
 * decides what to offer (the price filter and the rate line).
 */
export async function Directory({
  searchParams,
  basePath,
  viewer,
}: {
  searchParams: SearchParams;
  basePath: DirectoryBase;
  viewer: AppUser | null;
}) {
  const [params, niches] = await Promise.all([searchParams, listNiches()]);
  const seesDetails = viewer?.role === "business" || viewer?.role === "admin";
  const filters = parseDirectoryFilters(
    params,
    niches.map((n) => n.slug),
    { canFilterByRate: seesDetails },
  );
  const { creators, total } = await searchCreators(filters);
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  const filtered = hasActiveFilters(filters);
  const inPortal = basePath !== "/creators";

  return (
    <>
      <div className="mt-8">
        <DirectoryFilters
          niches={niches}
          filters={filters}
          showRateFilter={seesDetails}
          basePath={basePath}
        />
      </div>

      <section aria-labelledby="results-title" className="mt-10">
        <h2 id="results-title" className="sr-only">
          Results
        </h2>
        <p
          role="status"
          // In the portal the empty state says it; keep this for screen readers.
          className={
            total === 0 && inPortal ? "sr-only" : "font-semibold text-ink"
          }
        >
          {total === 0
            ? filtered
              ? "No creators match these filters."
              : "No creators listed yet."
            : total === 1
              ? "1 creator"
              : `${total.toLocaleString("en-NG")} creators`}
        </p>

        {total === 0 ? (
          inPortal ? (
            <div className="mt-5">
              <EmptyState
                icon={Search}
                tone="lilac"
                title={
                  filtered ? "No one matches yet" : "No creators listed yet"
                }
                action={
                  filtered && (
                    <Link
                      href={basePath}
                      className={buttonVariants({ variant: "secondary" })}
                    >
                      See everyone
                    </Link>
                  )
                }
              >
                {filtered
                  ? "Try fewer filters: a wider follower range or any state."
                  : "The first creators are setting up their profiles. Check back soon."}
              </EmptyState>
            </div>
          ) : (
            <p className="mt-2 max-w-xl text-muted">
              {filtered ? (
                <>
                  Try fewer filters, or{" "}
                  <Link href={basePath} className="link">
                    see everyone
                  </Link>
                  .
                </>
              ) : (
                "The first creators are setting up their profiles. Check back soon."
              )}
            </p>
          )
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {creators.map((creator, index) => (
              <li key={creator.slug} className="grid">
                <CreatorCard
                  href={`${basePath}/${creator.slug}`}
                  displayName={creator.displayName}
                  photoUrl={creator.photoUrl}
                  city={creator.city}
                  state={creator.state}
                  nicheNames={creator.niches.flatMap(
                    (slug) => nicheName.get(slug) ?? [],
                  )}
                  platforms={creator.platforms}
                  rate={seesDetails ? creator.startingRateKobo : undefined}
                  priority={index < 4}
                />
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav
            aria-label="Pages"
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            {filters.page > 1 && (
              <Link
                href={`${basePath}${directoryQuery({ ...filters, page: filters.page - 1 })}`}
                className={buttonVariants({ variant: "secondary" })}
                rel="prev"
              >
                Previous
              </Link>
            )}
            <p className="text-sm text-muted">
              Page {filters.page} of {pages}
            </p>
            {filters.page < pages && (
              <Link
                href={`${basePath}${directoryQuery({ ...filters, page: filters.page + 1 })}`}
                className={buttonVariants({ variant: "secondary" })}
                rel="next"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
