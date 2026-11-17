import { BadgeCheck, MapPin } from "lucide-react";
import Link from "next/link";

import { Chip } from "@/components/brand/fragments";
import type { PlatformListing } from "@/lib/creator-profile";
import { formatNaira } from "@/lib/money";
import { stateLabel, type NigerianState } from "@/lib/profile";

import { CreatorPhoto } from "./creator-photo";
import { PlatformSummary } from "./platform-list";

// Niches shown on a card before "+2"; the profile page lists them all.
const NICHES_SHOWN = 2;

/**
 * One creator in the directory: photo (with a Verified badge when we have
 * checked one of their accounts), name, place and niches, then a footer strip
 * with their platforms and, for viewers who may see it, the starting rate.
 * The whole card is clickable through the name link (stretched over the
 * card), so screen readers hear just the name. With `href` null (a preview
 * of an unpublished profile) nothing links.
 */
export function CreatorCard({
  href,
  displayName,
  photoUrl,
  city,
  state,
  nicheNames,
  platforms,
  rate,
  priority,
}: {
  /** The profile page, e.g. `/creators/<slug>`; null for a preview. */
  href: string | null;
  displayName: string;
  photoUrl: string | null;
  city: string;
  state: NigerianState;
  nicheNames: string[];
  platforms: PlatformListing[];
  /** Only for viewers who may see rates; undefined hides it. */
  rate?: number | null;
  priority?: boolean;
}) {
  const verified = platforms.some((p) => p.verified);
  const hiddenNiches = nicheNames.length - NICHES_SHOWN;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-card panel hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:hover:-translate-y-px has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ink has-[a:hover]:ring-field [&_a]:outline-none">
      <div className="relative p-2 pb-0">
        <CreatorPhoto
          name={displayName}
          url={photoUrl}
          priority={priority}
          className="aspect-[4/3]"
          sizes="(min-width: 1280px) 18rem, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
        />
        {verified && (
          <span className="absolute top-4 left-4 inline-flex items-center gap-1 rounded-full bg-white py-1 pr-2.5 pl-1.5 text-xs font-semibold text-ink shadow-card ring-1 ring-hairline">
            <BadgeCheck
              className="size-4 fill-brand-coral text-white"
              aria-hidden="true"
            />
            Verified
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <h2 className="truncate text-base leading-snug font-semibold">
          {href ? (
            <Link
              href={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-card"
            >
              {displayName}
            </Link>
          ) : (
            displayName
          )}
        </h2>
        <p className="mt-0.5 flex items-center gap-1 text-[0.8125rem] text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {city}, {stateLabel(state)}
          </span>
        </p>
        {nicheNames.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Niches">
            {nicheNames.slice(0, NICHES_SHOWN).map((name) => (
              <li key={name}>
                <Chip>{name}</Chip>
              </li>
            ))}
            {hiddenNiches > 0 && (
              <li>
                <Chip className="text-muted">
                  +{hiddenNiches}
                  <span className="sr-only"> more</span>
                </Chip>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-hairline bg-surface-soft/60 px-4 py-3">
        <PlatformSummary platforms={platforms} />
        {rate !== undefined && (
          <p className="shrink-0 text-right">
            <span className="block text-[0.6875rem] leading-tight text-muted">
              {rate === null ? "Rate" : "From"}
            </span>
            <span className="block text-sm font-semibold text-ink tabular-nums">
              {rate === null ? "Negotiable" : formatNaira(rate)}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}
