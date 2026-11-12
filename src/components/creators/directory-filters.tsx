import { SelectField } from "@/components/ui/field";
import {
  FilterBar,
  filterHref,
  type ActiveFilter,
} from "@/components/ui/filter-bar";
import {
  MAX_RATE_OPTIONS_NAIRA,
  MIN_FOLLOWER_LABELS,
  PLATFORM_RULES,
  PLATFORMS,
  type DirectoryFilters as Filters,
} from "@/lib/creator-profile";
import type { Niche } from "@/lib/db/creators";
import { formatNaira, KOBO_PER_NAIRA } from "@/lib/money";
import { NIGERIAN_STATES, stateLabel } from "@/lib/profile";

/**
 * A plain GET form: works without JavaScript, and every filtered view has a
 * URL people can share. The price filter only exists for businesses.
 */
export type DirectoryBase = "/creators" | "/business/creators";

export function DirectoryFilters({
  niches,
  filters,
  showRateFilter,
  basePath,
}: {
  niches: Niche[];
  filters: Filters;
  showRateFilter: boolean;
  /** The public directory, or the one inside the business portal. */
  basePath: DirectoryBase;
}) {
  // Each chip links to this page without its own filter.
  const params = {
    niche: filters.niche,
    platform: filters.platform,
    followers: filters.minFollowers,
    state: filters.state,
    maxRate: filters.maxRateNaira ? String(filters.maxRateNaira) : undefined,
  };
  const without = (key: keyof typeof params) =>
    filterHref(basePath, { ...params, [key]: undefined });

  const active: ActiveFilter[] = [];
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

  return (
    <FilterBar
      action={basePath}
      label="Filter creators"
      submitLabel="Show creators"
      active={active}
      fieldsClassName={
        showRateFilter
          ? "grid grid-cols-2 lg:grid-cols-5"
          : "grid grid-cols-2 lg:grid-cols-4"
      }
    >
      <SelectField
        compact
        label="Niche"
        name="niche"
        placeholder="Any niche"
        options={niches.map((n) => ({ value: n.slug, label: n.name }))}
        defaultValue={filters.niche ?? ""}
        className="col-span-2 sm:col-span-1"
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
        options={Object.entries(MIN_FOLLOWER_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
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
        className={showRateFilter ? undefined : "col-span-2 sm:col-span-1"}
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
    </FilterBar>
  );
}
