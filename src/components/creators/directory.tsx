import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  DIRECTORY_PAGE_SIZE,
  directoryQuery,
  hasActiveFilters,
  parseDirectoryFilters,
  type DirectoryFilters as Filters,
} from "@/lib/creator-profile";
import { listNiches, searchCreators, type Niche } from "@/lib/db/creators";
import type { AppUser } from "@/lib/db/users";
import { pageCount } from "@/lib/paging";
import { cn } from "@/lib/utils";

import { CreatorCard } from "./creator-card";
import { DirectoryFilters, type DirectoryBase } from "./directory-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The creator directory's search, results and paging, for the public page
 * and the one inside the business portal. Every link stays under
 * `basePath`. The database decides what each viewer may see; this only
 * decides what to offer (the price filter, @handle search and the rate line).
 *
 * The grid is equal-width on purpose: making some creators bigger by their
 * place in the list would read as paid prominence (CLAUDE.md §10). Cards
 * differ by what each creator added (a cover, a bio) instead.
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
  const pages = pageCount(total, DIRECTORY_PAGE_SIZE);
  const filtered = hasActiveFilters(filters);
  const inPortal = basePath !== "/creators";

  const status =
    total === 0
      ? filtered
        ? "No creators match"
        : "No creators listed yet"
      : total === 1
        ? "1 creator"
        : `${total.toLocaleString("en-NG")} creators`;

  return (
    <>
      <DirectoryFilters
        niches={niches}
        filters={filters}
        showRateFilter={seesDetails}
        basePath={basePath}
        status={status}
        afterSearch={
          inPortal ? undefined : (
            <NicheIndex niches={niches} filters={filters} />
          )
        }
      />

      <section
        aria-labelledby="results-title"
        className={inPortal ? "mt-5" : "mt-6"}
      >
        <h2 id="results-title" className="sr-only">
          Creators
        </h2>

        {total === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={Search}
              tone="lilac"
              title={filtered ? "No one matches yet" : "No creators listed yet"}
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
              {filters.search
                ? "Try other words, or fewer filters."
                : filtered
                  ? "Try fewer filters: a wider follower range or any state."
                  : "The first creators are setting up their profiles. Check back soon."}
            </EmptyState>
          </div>
        ) : (
          <ul
            className={cn(
              "grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              inPortal ? "gap-3" : "gap-4 lg:gap-5",
            )}
          >
            {creators.map((creator, index) => (
              <li key={creator.slug} className="grid">
                <CreatorCard
                  href={`${basePath}/${creator.slug}`}
                  displayName={creator.displayName}
                  photoUrl={creator.photoUrl}
                  coverUrl={creator.coverUrl}
                  bio={creator.bio}
                  city={creator.city}
                  state={creator.state}
                  nicheNames={creator.niches.flatMap(
                    (slug) => nicheName.get(slug) ?? [],
                  )}
                  platforms={creator.platforms}
                  rate={seesDetails ? creator.startingRateKobo : undefined}
                  priority={index < 2}
                />
              </li>
            ))}
          </ul>
        )}

        {/* The toolbar already says the count; the pager is for paging. */}
        {pages > 1 && (
          <Pagination
            page={filters.page}
            pages={pages}
            total={total}
            pageSize={DIRECTORY_PAGE_SIZE}
            noun={["creator", "creators"]}
            hrefFor={(page) =>
              `${basePath}${directoryQuery({ ...filters, page })}`
            }
          />
        )}
      </section>
    </>
  );
}

/**
 * Every niche, set as an index in display type: one swipeable line on
 * phones, wrapping words from 640px. Each is a link to that niche (keeping
 * the sort), so browsing works with no JavaScript and every niche has a URL.
 */
function NicheIndex({
  niches,
  filters,
}: {
  niches: Niche[];
  filters: Filters;
}) {
  const sort = filters.sort === "newest" ? "" : `&sort=${filters.sort}`;
  return (
    <nav aria-label="Browse by niche" className="mt-6 sm:mt-8">
      <ul className="-mx-4 flex snap-x gap-x-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-x-5 sm:overflow-visible sm:px-0 sm:pb-0">
        <li className="shrink-0 snap-start">
          <IndexLink
            href={`/creators${sort ? `?${sort.slice(1)}` : ""}`}
            current={!filters.niche}
          >
            All
          </IndexLink>
        </li>
        {niches.map((niche) => (
          <li key={niche.slug} className="shrink-0 snap-start">
            <IndexLink
              href={`/creators?niche=${niche.slug}${sort}`}
              current={filters.niche === niche.slug}
            >
              {niche.name}
            </IndexLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function IndexLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center font-display text-lg font-semibold tracking-[-0.02em] whitespace-nowrap decoration-2 underline-offset-[6px] sm:min-h-9 sm:text-xl",
        current
          ? "text-ink underline decoration-brand-violet"
          : "text-muted hover:text-ink motion-safe:transition-colors",
      )}
    >
      {children}
    </Link>
  );
}
