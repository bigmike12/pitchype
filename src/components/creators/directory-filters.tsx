import { Search, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { filterHref, type ActiveFilter } from "@/components/ui/filter-bar";
import {
  DIRECTORY_SORT_LABELS,
  DIRECTORY_SORTS,
  MAX_RATE_OPTIONS_NAIRA,
  MIN_FOLLOWER_LABELS,
  PLATFORM_RULES,
  PLATFORMS,
  type DirectoryFilters as Filters,
} from "@/lib/creator-profile";
import type { Niche } from "@/lib/db/creators";
import { formatNaira, KOBO_PER_NAIRA } from "@/lib/money";
import { NIGERIAN_STATES, stateLabel } from "@/lib/profile";
import { SEARCH_MAX } from "@/lib/search";
import { cn } from "@/lib/utils";

import { FilterSheet, SubmitOnChange } from "./directory-controls";

export type DirectoryBase = "/creators" | "/business/creators";

/**
 * The directory's one search form: a large search field first (the page's
 * main action), then a toolbar with the result count, Filters and Sort, and
 * the filters that are on as chips. A plain GET form: it works without
 * JavaScript and every view has a URL people can share. The price filter
 * exists only for businesses. Businesses can also search by @handle; the
 * database ignores handles for everyone else.
 */
export function DirectoryFilters({
  niches,
  filters,
  showRateFilter,
  basePath,
  status,
  afterSearch,
}: {
  niches: Niche[];
  filters: Filters;
  showRateFilter: boolean;
  /** The public directory, or the one inside the business portal. */
  basePath: DirectoryBase;
  /** The result count, said in the toolbar. */
  status: string;
  /** Shown between the search field and the toolbar (the public niche index). */
  afterSearch?: ReactNode;
}) {
  const inPortal = basePath !== "/creators";
  const params = {
    q: filters.search,
    niche: filters.niche,
    platform: filters.platform,
    followers: filters.minFollowers,
    state: filters.state,
    maxRate: filters.maxRateNaira ? String(filters.maxRateNaira) : undefined,
    sort: filters.sort === "newest" ? undefined : filters.sort,
  };
  const without = (key: keyof typeof params) =>
    filterHref(basePath, { ...params, [key]: undefined });

  const active: ActiveFilter[] = [];
  if (filters.search) {
    active.push({
      label: "Search",
      value: `“${filters.search}”`,
      href: without("q"),
    });
  }
  if (filters.niche) {
    active.push({
      label: "Niche",
      value:
        niches.find((n) => n.slug === filters.niche)?.name ?? filters.niche,
      href: without("niche"),
    });
  }
  if (filters.platform) {
    active.push({
      label: "Platform",
      value: PLATFORM_RULES[filters.platform].label,
      href: without("platform"),
    });
  }
  if (filters.minFollowers) {
    active.push({
      label: "Followers",
      value: MIN_FOLLOWER_LABELS[filters.minFollowers],
      href: without("followers"),
    });
  }
  if (filters.state) {
    active.push({
      label: "State",
      value: stateLabel(filters.state),
      href: without("state"),
    });
  }
  if (showRateFilter && filters.maxRateNaira) {
    active.push({
      label: "Starting rate",
      value: `Up to ${formatNaira(filters.maxRateNaira * KOBO_PER_NAIRA)}`,
      href: without("maxRate"),
    });
  }
  // Search is in the field above, not the sheet.
  const inSheet = active.filter((f) => f.label !== "Search").length;

  return (
    <form
      method="get"
      action={basePath}
      role="search"
      aria-label="Find creators"
    >
      <div className={cn("flex gap-2", inPortal ? "" : "sm:gap-3")}>
        <div className="relative min-w-0 flex-1">
          <label htmlFor="q" className="sr-only">
            {showRateFilter
              ? "Search by name, place, niche or @handle"
              : "Search by name, place or niche"}
          </label>
          <Search
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted",
              inPortal ? "left-3 size-4" : "left-4 size-5",
            )}
          />
          <input
            id="q"
            name="q"
            type="search"
            maxLength={SEARCH_MAX}
            defaultValue={filters.search ?? ""}
            placeholder={
              showRateFilter
                ? "Name, place, niche or @handle"
                : "Name, place or niche"
            }
            className={cn(
              "block w-full rounded-control border border-field bg-surface text-ink shadow-[0_1px_2px_rgb(14_14_16/0.04)] placeholder:text-muted focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_rgb(91_61_245/0.12)] motion-safe:transition-[border-color,box-shadow]",
              inPortal
                ? "h-11 pr-3 pl-9 text-base lg:h-10 lg:text-sm"
                : "h-14 pr-4 pl-12 text-base sm:text-lg",
            )}
          />
        </div>
        <Button
          type="submit"
          size={inPortal ? "sm" : "lg"}
          className={inPortal ? "lg:h-10" : "h-14 px-5 sm:px-7"}
        >
          Search
        </Button>
      </div>

      {afterSearch}

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:gap-y-5">
          <p role="status" className="text-sm font-semibold text-ink">
            {status}
          </p>
          {/* From 1024px this wrapper steps aside, so the filter row can
              take a line of its own above the count and Sort. */}
          <div className="flex items-center gap-2 lg:contents">
            <FilterSheet active={inSheet}>
              <div
                className={cn(
                  "grid gap-4 lg:gap-3",
                  showRateFilter ? "lg:grid-cols-5" : "lg:grid-cols-4",
                )}
              >
                <SelectField
                  compact
                  label="Niche"
                  name="niche"
                  placeholder="Any niche"
                  options={niches.map((n) => ({
                    value: n.slug,
                    label: n.name,
                  }))}
                  defaultValue={filters.niche ?? ""}
                />
                <SelectField
                  compact
                  label="Platform"
                  name="platform"
                  placeholder="Any platform"
                  options={PLATFORMS.map((p) => ({
                    value: p,
                    label: PLATFORM_RULES[p].label,
                  }))}
                  defaultValue={filters.platform ?? ""}
                />
                <SelectField
                  compact
                  label="Followers"
                  name="followers"
                  placeholder="Any number"
                  options={Object.entries(MIN_FOLLOWER_LABELS).map(
                    ([value, label]) => ({
                      value,
                      label,
                    }),
                  )}
                  defaultValue={filters.minFollowers ?? ""}
                />
                <SelectField
                  compact
                  label="State"
                  name="state"
                  placeholder="Anywhere"
                  options={NIGERIAN_STATES.map((s) => ({
                    value: s,
                    label: stateLabel(s),
                  }))}
                  defaultValue={filters.state ?? ""}
                />
                {showRateFilter && (
                  <SelectField
                    compact
                    label="Starting rate"
                    name="maxRate"
                    placeholder="Any rate"
                    options={MAX_RATE_OPTIONS_NAIRA.map((naira) => ({
                      value: String(naira),
                      label: `Up to ${formatNaira(naira * KOBO_PER_NAIRA)}`,
                    }))}
                    defaultValue={
                      filters.maxRateNaira ? String(filters.maxRateNaira) : ""
                    }
                  />
                )}
              </div>
              <Button type="submit" className="mt-5 w-full lg:hidden">
                Show creators
              </Button>
            </FilterSheet>
            <SubmitOnChange>
              <label className="flex items-center gap-2 text-sm text-muted">
                <span className="max-sm:sr-only">Sort</span>
                <span className="relative">
                  <select
                    name="sort"
                    defaultValue={filters.sort}
                    key={filters.sort}
                    className="h-11 appearance-none rounded-control border border-hairline-strong bg-surface pr-8 pl-3 text-sm font-semibold text-ink shadow-card lg:h-9"
                  >
                    {DIRECTORY_SORTS.map((sort) => (
                      <option key={sort} value={sort}>
                        {DIRECTORY_SORT_LABELS[sort]}
                      </option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted"
                  >
                    <path
                      d="m4 6 4 4 4-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </label>
            </SubmitOnChange>
          </div>
        </div>
      </div>

      {active.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ul aria-label="Filters on" className="contents">
            {active.map((filter) => (
              <li key={filter.label}>
                <Link
                  href={filter.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-3 text-[0.8125rem] ring-1 ring-hairline hover:ring-ink lg:min-h-8 motion-safe:transition-shadow"
                >
                  <span className="text-muted">{filter.label}</span>
                  <span className="font-medium text-ink">{filter.value}</span>
                  <X aria-hidden="true" className="size-3.5 text-ink" />
                  <span className="sr-only">Remove {filter.label} filter</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={filterHref(basePath, { sort: params.sort })}
            className="link inline-flex min-h-11 items-center text-[0.8125rem] font-medium lg:min-h-8"
          >
            Clear all
          </Link>
        </div>
      )}
    </form>
  );
}
