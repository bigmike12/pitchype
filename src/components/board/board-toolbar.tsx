import { Search } from "lucide-react";
import Link from "next/link";

import { CreatorPhoto } from "@/components/creators/creator-photo";
import { SelectField, TextField } from "@/components/ui/field";
import {
  FilterBar,
  filterHref,
  type ActiveFilter,
} from "@/components/ui/filter-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

  const noun = personNoun[0].toUpperCase() + personNoun.slice(1);
  const plural = personNoun.endsWith("s") ? `${noun}es` : `${noun}s`;
  const hidden = people.length - MAX_PEOPLE;

  return (
    <div className="mb-4">
      <FilterBar
        action={basePath}
        label="Search and filter the board"
        submitLabel="Filter"
        active={active}
        fieldsClassName={
          campaigns
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]"
            : "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]"
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
        {people.length > 0 && (
          // The people on the board: tap one to narrow the board to them.
          <nav
            aria-label={`${plural} on this board`}
            className={campaigns ? "sm:col-span-2 lg:col-span-1" : undefined}
          >
            <p className="text-[0.8125rem] font-medium text-muted">{plural}</p>
            <ul className="mt-1.5 flex items-center pl-2">
              {people.slice(0, MAX_PEOPLE).map((person) => {
                const on = person.id === who;
                return (
                  <li key={person.id} className="-ml-2 first:ml-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={hrefWith({ who: on ? undefined : person.id })}
                          aria-current={on ? "true" : undefined}
                          scroll={false}
                          className="grid size-11 place-items-center rounded-full lg:size-9"
                        >
                          <CreatorPhoto
                            name={person.name}
                            url={person.photoUrl}
                            sizes="36px"
                            className={cn(
                              "size-9 rounded-full ring-2",
                              on ? "ring-ink" : "ring-surface",
                            )}
                          />
                          <span className="sr-only">
                            {on ? "Show everyone" : `Show only ${person.name}`}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>{person.name}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
              {hidden > 0 && (
                <li className="-ml-2 grid size-11 place-items-center lg:size-9">
                  <span className="grid size-9 place-items-center rounded-full bg-surface-soft text-xs font-semibold text-ink ring-2 ring-surface">
                    +{hidden}
                    <span className="sr-only">
                      {" "}
                      more {hidden === 1 ? personNoun : plural.toLowerCase()}:
                      search to find them
                    </span>
                  </span>
                </li>
              )}
            </ul>
          </nav>
        )}
      </FilterBar>
    </div>
  );
}
