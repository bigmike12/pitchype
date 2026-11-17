import { Search } from "lucide-react";
import Link from "next/link";

import { CreatorPhoto } from "@/components/creators/creator-photo";
import { SelectField, TextField } from "@/components/ui/field";
import {
  FilterBar,
  filterHref,
  type ActiveFilter,
} from "@/components/ui/filter-bar";
import { SEARCH_MAX } from "@/lib/search";
import { cn } from "@/lib/utils";

export type BoardPerson = { id: string; name: string; photoUrl: string | null };

/** The board's URL state. `q` is already parsed (trimmed, capped). */
export type BoardQuery = {
  q?: string;
  /** The person picked in the people row. */
  who?: string;
  /** The campaign picked in the filter (business board only). */
  campaign?: string;
  /** The phone's column. */
  col?: string;
};

// Enough faces to read as a stack; anyone else is found by search.
const MAX_PEOPLE = 8;

/**
 * The board's search and filters: a people row (one avatar per person on the
 * board; tap one to narrow the board to them), then a GET form with the
 * search, the optional campaign, and the active filters listed as chips.
 * Every filtered view is a URL, the same as the directory's.
 */
export function BoardToolbar({
  basePath,
  query,
  people,
  personNoun,
  searchPlaceholder,
  campaigns,
}: {
  basePath: string;
  query: BoardQuery;
  /** Everyone on the board, before the filters. */
  people: BoardPerson[];
  /** "creator" or "business", for the labels. */
  personNoun: string;
  searchPlaceholder: string;
  /** The campaign filter's choices; leave out where there is none. */
  campaigns?: { id: string; title: string }[];
}) {
  const { q, who, campaign, col } = query;
  // This board with one part of the query changed or dropped.
  const hrefWith = (change: BoardQuery) =>
    filterHref(basePath, { q, who, campaign, col, ...change });

  const active: ActiveFilter[] = [];
  if (q) {
    active.push({
      label: "Search",
      value: `“${q}”`,
      href: hrefWith({ q: undefined }),
    });
  }
  if (who) {
    active.push({
      label: personNoun[0].toUpperCase() + personNoun.slice(1),
      value: people.find((p) => p.id === who)?.name ?? "Picked",
      href: hrefWith({ who: undefined }),
    });
  }
  const picked = campaigns?.find((c) => c.id === campaign);
  if (picked) {
    active.push({
      label: "Campaign",
      value: picked.title,
      href: hrefWith({ campaign: undefined }),
    });
  }

  return (
    <div className="mb-4 space-y-3">
      {people.length > 0 && (
        <nav
          aria-label={`${personNoun[0].toUpperCase() + personNoun.slice(1)}s on this board`}
          className="flex flex-wrap items-center gap-y-1"
        >
          <ul className="flex items-center pl-3">
            {people.slice(0, MAX_PEOPLE).map((person) => {
              const on = person.id === who;
              return (
                <li key={person.id} className="-ml-3 first:ml-0">
                  <Link
                    href={hrefWith({ who: on ? undefined : person.id })}
                    aria-current={on ? "true" : undefined}
                    scroll={false}
                    className="grid size-11 place-items-center rounded-full"
                  >
                    <CreatorPhoto
                      name={person.name}
                      url={person.photoUrl}
                      sizes="36px"
                      className={cn(
                        "size-9 rounded-full ring-2",
                        on ? "ring-ink" : "ring-canvas",
                      )}
                    />
                    <span className="sr-only">
                      {on ? "Show everyone" : `Show only ${person.name}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {people.length > MAX_PEOPLE && (
            <p className="px-2 text-xs text-muted">
              +{people.length - MAX_PEOPLE} more: search for them
            </p>
          )}
        </nav>
      )}

      <FilterBar
        action={basePath}
        label="Search and filter the board"
        submitLabel="Filter"
        active={active}
        fieldsClassName={
          campaigns
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
            : "grid grid-cols-1"
        }
      >
        {who && <input type="hidden" name="who" value={who} />}
        {col && <input type="hidden" name="col" value={col} />}
        <TextField
          compact
          type="search"
          label="Search"
          name="q"
          icon={Search}
          placeholder={searchPlaceholder}
          maxLength={SEARCH_MAX}
          defaultValue={q ?? ""}
        />
        {campaigns && (
          <SelectField
            compact
            name="campaign"
            label="Campaign"
            placeholder="All campaigns"
            defaultValue={campaign ?? ""}
            options={campaigns.map((c) => ({ value: c.id, label: c.title }))}
          />
        )}
      </FilterBar>
    </div>
  );
}
