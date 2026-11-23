import Image from "next/image";

import { cn } from "@/lib/utils";

import { toneFor } from "./creator-photo";

/**
 * The band across the top of a creator's page: their cover, or, with none,
 * a flat colour from their name with their first name set large in its
 * bottom right corner (clear of the photo, which overlaps the bottom left),
 * so a page with nothing optional filled in still has a face. Decorative:
 * the name is the page's heading just below.
 */
export function CoverImage({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  const first = name.split(/\s+/)[0] ?? name;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-frame [container-type:inline-size]",
        url ? "bg-surface-card" : toneFor(name),
        className,
      )}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          priority
          unoptimized
          sizes="(min-width: 1280px) 76rem, 100vw"
          className="object-cover"
        />
      ) : (
        <span className="absolute right-[0.06em] -bottom-[0.2em] font-display text-[clamp(4.5rem,20cqi,16rem)] leading-none font-semibold tracking-[-0.06em] whitespace-nowrap text-ink/85 select-none">
          {first}
        </span>
      )}
    </div>
  );
}
