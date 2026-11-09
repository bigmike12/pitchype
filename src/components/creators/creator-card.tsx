import { MapPin } from "lucide-react";
import Link from "next/link";

import { Chip } from "@/components/brand/fragments";
import { startingRateText, type PlatformListing } from "@/lib/creator-profile";
import { stateLabel, type NigerianState } from "@/lib/profile";

import { CreatorPhoto } from "./creator-photo";
import { PlatformSummary } from "./platform-list";

/**
 * One creator in the directory. The whole card is clickable through the
 * name link (stretched over the card), so screen readers hear just the name.
 */
export function CreatorCard({
  slug,
  displayName,
  photoUrl,
  city,
  state,
  nicheNames,
  platforms,
  rate,
  priority,
}: {
  slug: string;
  displayName: string;
  photoUrl: string | null;
  city: string;
  state: NigerianState;
  nicheNames: string[];
  platforms: PlatformListing[];
  /** Only for viewers who may see rates; undefined hides the line. */
  rate?: number | null;
  priority?: boolean;
}) {
  return (
    <article className="relative flex flex-col rounded-card bg-white p-3 ring-1 ring-hairline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ink has-[a:hover]:ring-field [&_a]:outline-none">
      <CreatorPhoto
        name={displayName}
        url={photoUrl}
        priority={priority}
        sizes="(min-width: 1280px) 18rem, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
      />
      <div className="flex flex-1 flex-col px-1 pt-4 pb-1">
        <h2 className="text-lg leading-snug font-semibold">
          <Link
            href={`/creators/${slug}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-card"
          >
            {displayName}
          </Link>
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          {city}, {stateLabel(state)}
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Niches">
          {nicheNames.map((name) => (
            <li key={name}>
              <Chip>{name}</Chip>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-4">
          <PlatformSummary platforms={platforms} />
          {rate !== undefined && (
            <p className="mt-3 text-sm font-semibold text-ink">
              {startingRateText(rate)}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
