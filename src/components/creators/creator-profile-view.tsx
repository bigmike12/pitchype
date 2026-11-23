import { MapPin } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { startingRateText } from "@/lib/creator-profile";
import type { CreatorPage, PortfolioSample } from "@/lib/db/creators";
import { stateLabel } from "@/lib/profile";
import { cn } from "@/lib/utils";

import { CoverImage } from "./cover-image";
import { CreatorPhoto } from "./creator-photo";
import { PlatformDetails } from "./platform-list";
import { PortfolioGallery } from "./portfolio-gallery";
import { TrackRecord } from "./track-record";

/**
 * A creator's page, shared by the public profile and the business portal:
 * the cover band with their photo set over its edge, name, place and the
 * page's actions; then their bio, work and platforms, beside a column of
 * facts (track record, the rate for viewers who may see it) and `aside`
 * (what the viewer can do next). `children` go last, under both columns
 * (the report form). The database has already decided what this
 * viewer may see: handles and post links arrive only for businesses and admins.
 */
export function CreatorProfileView({
  creator,
  nicheNames,
  samples,
  actions,
  aside,
  inPortal = false,
  children,
}: {
  creator: CreatorPage;
  nicheNames: string[];
  samples: PortfolioSample[];
  /** Buttons beside the name: Share and the viewer's main action. */
  actions?: ReactNode;
  /** The last card in the facts column. */
  aside?: ReactNode;
  inPortal?: boolean;
  children?: ReactNode;
}) {
  return (
    <article>
      <header>
        <CoverImage
          name={creator.displayName}
          url={creator.coverUrl}
          className={cn(
            "aspect-[16/9]",
            inPortal ? "sm:aspect-[3/1]" : "sm:aspect-[5/2] lg:aspect-[3/1]",
          )}
        />
        <div className="relative -mt-12 flex flex-col gap-5 px-3 sm:-mt-16 sm:px-6 lg:flex-row lg:items-start lg:gap-7 lg:px-8">
          <CreatorPhoto
            name={creator.displayName}
            url={creator.photoUrl}
            sizes="(min-width: 640px) 9rem, 7rem"
            priority
            className="size-28 shrink-0 rounded-panel shadow-pop ring-4 ring-canvas sm:size-36"
          />
          {/* From 1024px the name starts below the band, never on it. */}
          <div className="min-w-0 flex-1 enter lg:pt-[5.25rem]">
            <h1
              className={cn(
                "break-words",
                inPortal ? "text-display-page" : "text-display-lg",
              )}
            >
              {creator.displayName}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {creator.city}, {stateLabel(creator.state)}
            </p>
          </div>
          {actions && (
            <div
              className="flex flex-wrap items-start gap-3 enter lg:pt-[5.75rem]"
              style={{ "--delay": "60ms" } as CSSProperties}
            >
              {actions}
            </div>
          )}
        </div>
      </header>

      <div className="mt-10 grid gap-10 px-0 sm:px-6 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14 lg:px-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="about-title">
            <h2 id="about-title" className="sr-only">
              About {creator.displayName}
            </h2>
            <ul className="flex flex-wrap gap-2" aria-label="Niches">
              {nicheNames.map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-hairline"
                >
                  {name}
                </li>
              ))}
            </ul>
            {creator.bio && (
              <p className="mt-6 max-w-[60ch] text-xl leading-relaxed text-pretty whitespace-pre-line text-ink">
                {creator.bio}
              </p>
            )}
          </section>

          {samples.length > 0 && (
            <section aria-labelledby="work-title">
              <h2 id="work-title" className="text-display-md">
                Work
              </h2>
              <div className="mt-5">
                <PortfolioGallery
                  samples={samples}
                  creatorName={creator.displayName}
                />
              </div>
            </section>
          )}

          <section aria-labelledby="platforms-title">
            <h2 id="platforms-title" className="text-display-md">
              Platforms
            </h2>
            <div className="mt-5">
              <PlatformDetails platforms={creator.platforms} />
            </div>
          </section>
        </div>

        <aside
          aria-label={`About working with ${creator.displayName}`}
          className="space-y-4 lg:sticky lg:top-24 lg:self-start"
        >
          <div className="rounded-panel p-5 panel">
            <TrackRecord
              completedJobs={creator.completedJobs}
              memberSince={creator.memberSince}
              platforms={creator.platforms}
            />
            {creator.detailsVisible && (
              <div className="mt-5 border-t border-hairline pt-5">
                <p className="text-[0.8125rem] text-muted">Starting rate</p>
                <p className="mt-0.5 font-display text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums">
                  {startingRateText(creator.startingRateKobo)}
                </p>
              </div>
            )}
          </div>
          {aside}
        </aside>
      </div>

      {children && <div className="mt-12 sm:px-6 lg:px-8">{children}</div>}
    </article>
  );
}
