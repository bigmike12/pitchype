import Image from "next/image";

import { cn } from "@/lib/utils";

const TONES = [
  "bg-brand-mint",
  "bg-brand-lilac",
  "bg-brand-sun",
  "bg-brand-peach",
  "bg-brand-coral",
] as const;

/** The same tone for the same name, every time. */
function toneFor(name: string) {
  let sum = 0;
  for (const char of name) sum = (sum + char.codePointAt(0)!) % 997;
  return TONES[sum % TONES.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A creator's square photo, or their initials on a brand colour. Photos are
 * already 512px WebP from our own pipeline, so Next's optimiser is skipped.
 * Decorative: the creator's name is always next to it.
 */
export function CreatorPhoto({
  name,
  url,
  sizes,
  priority,
  className,
}: {
  name: string;
  url: string | null;
  /** The `sizes` attribute: how wide the photo shows at each breakpoint. */
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // A size container, so the initials scale with the box.
        "relative aspect-square overflow-hidden rounded-card [container-type:inline-size]",
        url ? "bg-surface-card" : toneFor(name),
        className,
      )}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes={sizes}
          unoptimized
          priority={priority}
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center font-display text-[32cqi] leading-none font-semibold tracking-tight text-ink"
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
