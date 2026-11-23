import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";

import { Chip } from "@/components/brand/fragments";
import { Button } from "@/components/ui/button";
import { listNiches, type Niche } from "@/lib/db/creators";
import { SEARCH_MAX } from "@/lib/search";

// How many niches to offer as one-tap searches under the box.
const QUICK_NICHES = 6;

/**
 * The landing page's creator search (an experiment in place of the hero
 * illustration). A plain GET form to the directory, so it works without
 * JavaScript and the results page is the same shareable URL as a search made
 * there.
 */
export async function HeroSearch() {
  let niches: Niche[] = [];
  try {
    niches = (await listNiches()).slice(0, QUICK_NICHES);
  } catch (error) {
    // The search still works without the shortcuts.
    console.error(
      "hero search: niches lookup failed",
      error instanceof Error ? error.message : error,
    );
  }

  return (
    // From 640px the card's edges line up with the header's: 16px in until
    // the page is wide enough for both to stop at 76rem (the container's own
    // padding is 24px, then 32px).
    <div className="sm:-mx-2 lg:-mx-4 xl:mx-0 rounded-panel bg-surface p-4 text-left shadow-[0_1px_2px_rgb(14_14_16/0.04),0_12px_32px_-12px_rgb(14_14_16/0.12)] ring-1 ring-hairline sm:p-6 lg:p-8">
      <form action="/creators" role="search" aria-label="Find creators">
        <label htmlFor="hero-q" className="font-semibold text-ink">
          Find creators across Nigeria
        </label>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
            />
            <input
              id="hero-q"
              name="q"
              type="search"
              maxLength={SEARCH_MAX}
              placeholder="Name, place or niche"
              className="block h-14 w-full rounded-control border border-field bg-surface pr-4 pl-12 text-base text-ink shadow-[0_1px_2px_rgb(14_14_16/0.04)] placeholder:text-muted focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_rgb(91_61_245/0.12)] motion-safe:transition-[border-color,box-shadow] sm:text-lg"
            />
          </div>
          <Button type="submit" size="lg" className="h-14 px-7 lg:px-10">
            Search
          </Button>
        </div>
      </form>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        {niches.length > 0 && (
          // Phones: one swipeable line running to the card's edges (like the
          // directory's niche row). From 640px it wraps.
          <div className="-mx-4 flex snap-x scroll-px-4 items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:contents">
            <span className="shrink-0 snap-start text-sm text-muted">
              Popular:
            </span>
            <ul className="contents" aria-label="Popular niches">
              {niches.map((niche) => (
                <li key={niche.slug} className="shrink-0 snap-start">
                  <Link
                    href={`/creators?niche=${encodeURIComponent(niche.slug)}`}
                    className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Chip className="px-3 py-1.5 text-sm motion-safe:transition-transform motion-safe:hover:-translate-y-px">
                      {niche.name}
                    </Chip>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link
          href="/creators"
          className="link inline-flex items-center gap-1 self-start text-sm font-medium sm:ml-auto sm:self-auto"
        >
          Browse all creators
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
