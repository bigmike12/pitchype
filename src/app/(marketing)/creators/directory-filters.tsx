import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import {
  MAX_RATE_OPTIONS_NAIRA,
  MIN_FOLLOWER_LABELS,
  PLATFORM_RULES,
  PLATFORMS,
  hasActiveFilters,
  type DirectoryFilters as Filters,
} from "@/lib/creator-profile";
import type { Niche } from "@/lib/db/creators";
import { formatNaira, KOBO_PER_NAIRA } from "@/lib/money";
import { NIGERIAN_STATES, stateLabel } from "@/lib/profile";

/**
 * A plain GET form: works without JavaScript, and every filtered view has a
 * URL people can share. The price filter only exists for businesses.
 */
export function DirectoryFilters({
  niches,
  filters,
  showRateFilter,
}: {
  niches: Niche[];
  filters: Filters;
  showRateFilter: boolean;
}) {
  return (
    <form
      method="get"
      action="/creators"
      aria-label="Filter creators"
      className="rounded-panel bg-surface-soft p-4 sm:p-6"
    >
      <div
        className={
          showRateFilter
            ? "grid grid-cols-2 gap-4 lg:grid-cols-5"
            : "grid grid-cols-2 gap-4 lg:grid-cols-4"
        }
      >
        <SelectField
          label="Niche"
          name="niche"
          placeholder="Any niche"
          options={niches.map((n) => ({ value: n.slug, label: n.name }))}
          defaultValue={filters.niche ?? ""}
          className="col-span-2 sm:col-span-1"
        />
        <SelectField
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
          label="Followers"
          name="followers"
          placeholder="Any number"
          options={Object.entries(MIN_FOLLOWER_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
          defaultValue={filters.minFollowers ?? ""}
        />
        <SelectField
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
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="submit">Show creators</Button>
        {hasActiveFilters(filters) && (
          <Link href="/creators" className="link text-sm font-medium">
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}
