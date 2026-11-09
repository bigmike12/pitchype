import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreatorCard } from "@/components/creators/creator-card";
import { buttonVariants } from "@/components/ui/button";
import { getSignedInUser } from "@/lib/auth";
import {
  DIRECTORY_PAGE_SIZE,
  directoryQuery,
  hasActiveFilters,
  parseDirectoryFilters,
} from "@/lib/creator-profile";
import { listNiches, searchCreators } from "@/lib/db/creators";

import { DirectoryFilters } from "./directory-filters";

export const metadata: Metadata = {
  title: "Find Nigerian creators",
  description:
    "Browse micro and nano creators across Nigeria by niche, platform, followers and state. Follower counts are labelled self-reported or verified.",
  // Filtered views are the same page with fewer results.
  alternates: { canonical: "/creators" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CreatorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main id="main" className="container-page py-12 lg:py-16">
      <h1 className="text-display-lg">Find creators</h1>
      <p className="mt-3 max-w-2xl text-lg">
        Micro and nano creators across Nigeria. Follower counts are marked
        self-reported, or verified when we’ve checked the account.
      </p>
      <Suspense fallback={<DirectoryLoading />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Directory({ searchParams }: { searchParams: SearchParams }) {
  const [params, niches, viewer] = await Promise.all([
    searchParams,
    listNiches(),
    getSignedInUser(),
  ]);
  // The database decides what each viewer gets; this only decides what to
  // offer (the price filter, the rate line) and which prompt to show.
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

  return (
    <>
      <div className="mt-8">
        <DirectoryFilters
          niches={niches}
          filters={filters}
          showRateFilter={seesDetails}
        />
      </div>

      <section aria-labelledby="results-title" className="mt-10">
        <h2 id="results-title" className="sr-only">
          Results
        </h2>
        <p role="status" className="font-semibold text-ink">
          {total === 0
            ? filtered
              ? "No creators match these filters."
              : "No creators listed yet."
            : total === 1
              ? "1 creator"
              : `${total.toLocaleString("en-NG")} creators`}
        </p>

        {total === 0 ? (
          <p className="mt-2 max-w-xl text-muted">
            {filtered ? (
              <>
                Try fewer filters, or{" "}
                <Link href="/creators" className="link">
                  see everyone
                </Link>
                .
              </>
            ) : (
              "The first creators are setting up their profiles. Check back soon."
            )}
          </p>
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {creators.map((creator, index) => (
              <li key={creator.slug} className="grid">
                <CreatorCard
                  slug={creator.slug}
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
                href={`/creators${directoryQuery({ ...filters, page: filters.page - 1 })}`}
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
                href={`/creators${directoryQuery({ ...filters, page: filters.page + 1 })}`}
                className={buttonVariants({ variant: "secondary" })}
                rel="next"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>

      {!viewer && <BusinessPrompt />}
    </>
  );
}

// Signed-out visitors: the reason to sign up. Sign-up stays unlinked until
// launch, so this points to the waitlist for now.
function BusinessPrompt() {
  return (
    <aside className="mt-16 flex flex-col gap-5 rounded-panel bg-brand-sun p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div>
        <h2 className="text-display-md">Hiring creators for your business?</h2>
        <p className="mt-2 max-w-xl text-ink">
          Businesses on Pitchype see each creator’s handles, bio and starting
          rate, and can filter by budget.
        </p>
      </div>
      <Link href="/#waitlist" className={buttonVariants({ size: "lg" })}>
        Join the waitlist
      </Link>
    </aside>
  );
}

function DirectoryLoading() {
  return (
    <p role="status" aria-busy="true" className="mt-8 text-muted">
      Loading creators…
    </p>
  );
}
