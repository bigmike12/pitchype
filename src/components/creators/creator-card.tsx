import { BadgeCheck, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PlatformListing } from "@/lib/creator-profile";
import { formatNaira } from "@/lib/money";
import { stateLabel, type NigerianState } from "@/lib/profile";
import { cn } from "@/lib/utils";

import { CreatorPhoto } from "./creator-photo";
import { PlatformSummary } from "./platform-list";

// Niches shown on a card before "+2"; the profile page lists them all.
const NICHES_SHOWN = 2;

/**
 * One creator in the directory. The picture leads: their cover with the
 * photo set into its corner, or, with no cover, the photo (or initials)
 * filling the frame, so cards differ by what each creator added rather than
 * by rank. Then the name, place, the start of their bio and niches, and a
 * footer strip with platforms and, for viewers who may see it, the rate.
 * The name link stretches over the card, so screen readers hear just the
 * name. With `href` null (a preview of an unpublished profile) nothing links.
 */
export function CreatorCard({
  href,
  displayName,
  photoUrl,
  coverUrl = null,
  bio = null,
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
  coverUrl?: string | null;
  bio?: string | null;
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
  const sizes =
    "(min-width: 1280px) 18rem, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw";

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel panel hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:hover:-translate-y-px has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ink [&_a]:outline-none">
      <div className="relative p-2 pb-0">
        {coverUrl ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-surface-card">
            <Image
              src={coverUrl}
              alt=""
              fill
              unoptimized
              priority={priority}
              sizes={sizes}
              className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.02]"
            />
            <CreatorPhoto
              name={displayName}
              url={photoUrl}
              sizes="4.5rem"
              className="absolute bottom-3 left-3 size-[4.5rem] rounded-[0.875rem] shadow-pop ring-[3px] ring-white"
            />
          </div>
        ) : (
          <CreatorPhoto
            name={displayName}
            url={photoUrl}
            priority={priority}
            className="aspect-[4/3] [&_img]:motion-safe:transition-transform [&_img]:motion-safe:duration-500 group-hover:[&_img]:motion-safe:scale-[1.02]"
            sizes={sizes}
          />
        )}
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

      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
        <h3 className="truncate font-display text-lg leading-snug font-semibold tracking-[-0.02em]">
          {href ? (
            <Link
              href={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-panel"
            >
              {displayName}
            </Link>
          ) : (
            displayName
          )}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-[0.8125rem] text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {city}, {stateLabel(state)}
          </span>
        </p>
        {bio && (
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-body">
            {bio}
          </p>
        )}
        {nicheNames.length > 0 && (
          <ul
            className={cn("flex flex-wrap gap-1.5", bio ? "mt-3" : "mt-3.5")}
            aria-label="Niches"
          >
            {nicheNames.slice(0, NICHES_SHOWN).map((name) => (
              <li
                key={name}
                className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink"
              >
                {name}
              </li>
            ))}
            {hiddenNiches > 0 && (
              <li className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-muted">
                +{hiddenNiches}
                <span className="sr-only"> more</span>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
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
