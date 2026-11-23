"use client";

import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLATFORM_RULES } from "@/lib/creator-profile";
import type { PortfolioSample } from "@/lib/db/creators";

import { PlatformIcon } from "./platform-icon";

/**
 * A creator's work samples: a grid of 4:5 tiles, each a button that opens the
 * picture whole in a dialog, with Previous and Next (and the arrow keys).
 * Captions are the creator's own words. The link to the original post exists
 * only when the database sent one, which it does for businesses and admins.
 */
export function PortfolioGallery({
  samples,
  creatorName,
}: {
  samples: PortfolioSample[];
  creatorName: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? null : samples[open];
  const label = (index: number) =>
    samples[index].caption ?? `Work sample ${index + 1} by ${creatorName}`;

  function step(by: number) {
    setOpen((index) =>
      index === null ? null : (index + by + samples.length) % samples.length,
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {samples.map((sample, index) => (
          <li key={sample.id}>
            <figure>
              <button
                type="button"
                onClick={() => setOpen(index)}
                className="group relative block aspect-[4/5] w-full overflow-hidden rounded-card bg-surface-card ring-1 ring-hairline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink"
              >
                <Image
                  src={sample.imageUrl}
                  alt={label(index)}
                  fill
                  unoptimized
                  sizes="(min-width: 1024px) 15rem, (min-width: 640px) 30vw, 45vw"
                  className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[var(--ease-out-expo)] motion-safe:group-hover:scale-[1.03]"
                />
                <span className="sr-only">: open it larger</span>
              </button>
              {(sample.caption || sample.platform) && (
                <figcaption className="mt-2 flex items-start gap-1.5 text-sm leading-snug text-body">
                  {sample.platform && (
                    <PlatformIcon
                      platform={sample.platform}
                      className="mt-0.5 size-3.5 shrink-0 text-muted"
                    />
                  )}
                  <span className="line-clamp-2">
                    {sample.caption ?? PLATFORM_RULES[sample.platform!].label}
                  </span>
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        {current && open !== null && (
          <DialogContent
            className="max-w-3xl overflow-hidden p-0"
            closeLabel="Close the picture"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") step(1);
              if (event.key === "ArrowLeft") step(-1);
            }}
          >
            <div className="relative h-[min(70dvh,44rem)] bg-ink">
              <Image
                key={current.id}
                src={current.imageUrl}
                alt={label(open)}
                fill
                unoptimized
                sizes="(min-width: 768px) 48rem, 100vw"
                className="object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base">{label(open)}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  {open + 1} of {samples.length}
                  {current.platform &&
                    `, on ${PLATFORM_RULES[current.platform].label}`}
                </DialogDescription>
                {current.postUrl && (
                  <a
                    href={current.postUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="link mt-1 inline-flex items-center gap-1 text-sm"
                  >
                    See the original post
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </div>
              {samples.length > 1 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="grid size-11 place-items-center rounded-full ring-1 ring-hairline-strong hover:bg-surface-soft"
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                    <span className="sr-only">Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="grid size-11 place-items-center rounded-full ring-1 ring-hairline-strong hover:bg-surface-soft"
                  >
                    <ArrowRight className="size-5" aria-hidden="true" />
                    <span className="sr-only">Next</span>
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
