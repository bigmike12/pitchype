import { MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { Chip } from "@/components/brand/fragments";
import { startingRateText } from "@/lib/creator-profile";
import type { CreatorPage } from "@/lib/db/creators";
import { stateLabel } from "@/lib/profile";

import { CreatorPhoto } from "./creator-photo";
import { PlatformDetails } from "./platform-list";

/**
 * A creator's profile: photo, name, location, niches, rate and bio (when the
 * viewer may see them) and platforms. `children` go under the platforms
 * (what the viewer can do next, the report form). Shared by the public page
 * and the business portal.
 */
export function CreatorProfileView({
  creator,
  nicheNames,
  children,
}: {
  creator: CreatorPage;
  nicheNames: string[];
  children?: ReactNode;
}) {
  return (
    <article className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-4">
        <CreatorPhoto
          name={creator.displayName}
          url={creator.photoUrl}
          sizes="(min-width: 1024px) 24rem, (min-width: 640px) 20rem, 90vw"
          priority
          className="max-w-80 lg:max-w-none"
        />
      </div>

      <div className="lg:col-span-8">
        <h1 className="text-display-lg break-words">{creator.displayName}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          {creator.city}, {stateLabel(creator.state)}
        </p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Niches">
          {nicheNames.map((name) => (
            <li key={name}>
              <Chip className="px-3 py-1.5 text-sm">{name}</Chip>
            </li>
          ))}
        </ul>

        {creator.detailsVisible && (
          <dl className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Starting rate</dt>
              <dd className="mt-1 text-display-md">
                {startingRateText(creator.startingRateKobo)}
              </dd>
            </div>
            {creator.bio && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted">About</dt>
                <dd className="mt-1 max-w-[65ch] text-lg whitespace-pre-line">
                  {creator.bio}
                </dd>
              </div>
            )}
          </dl>
        )}

        <section aria-labelledby="platforms-title" className="mt-10">
          <h2 id="platforms-title" className="text-display-md">
            Platforms
          </h2>
          <div className="mt-4">
            <PlatformDetails platforms={creator.platforms} />
          </div>
        </section>

        {children}
      </div>
    </article>
  );
}
