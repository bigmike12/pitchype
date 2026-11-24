import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

// Fictional people and businesses (photos generated for this page, no real
// brands). The labels are added here, not baked into the images.
type Card = {
  src: string;
  kind: "creator" | "business";
  label: string;
  // Creators only. Shown from 1024px; narrower cards have no room for both.
  platform?: string;
};

// Five above the search and five below, outer to outer. On phones only the
// middle three of each row show, so the outer places hold the businesses and
// a phone still sees six creators.
const TOP: Card[] = [
  { src: "business-skincare", kind: "business", label: "Skincare" },
  {
    src: "creator-fashion",
    kind: "creator",
    label: "Fashion",
    platform: "TikTok",
  },
  {
    src: "creator-food",
    kind: "creator",
    label: "Food",
    platform: "Instagram",
  },
  {
    src: "creator-beauty",
    kind: "creator",
    label: "Beauty",
    platform: "Instagram",
  },
  { src: "business-cafe", kind: "business", label: "Café" },
];
const BOTTOM: Card[] = [
  { src: "business-boutique", kind: "business", label: "Boutique" },
  {
    src: "creator-fitness",
    kind: "creator",
    label: "Fitness",
    platform: "YouTube",
  },
  {
    src: "creator-market",
    kind: "creator",
    label: "Lifestyle",
    platform: "TikTok",
  },
  { src: "creator-tech", kind: "creator", label: "Tech", platform: "TikTok" },
  { src: "business-sneakers", kind: "business", label: "Sneakers" },
];

// How far each place drops (top row) or rises (bottom row), as a share of the
// card's own height, so the two rows curve towards each other at the sides
// and read as one ring around the search. Kept small enough that an outer
// card above never meets the one below it.
const ARCH = ["10%", "3%", "0%", "3%", "10%"];

const ARIA_LABEL =
  "Sample photos: creators filming fashion, food, beauty, fitness, lifestyle and tech content, and businesses such as a skincare brand, a café, a boutique and a sneaker maker.";

function PhotoCard({
  card,
  labelAt,
}: {
  card: Card;
  labelAt: "top" | "bottom";
}) {
  return (
    // A soft drop shadow well under the card, so it reads as floating.
    <figure className="relative aspect-[3/4] overflow-hidden rounded-panel bg-surface-card shadow-[0_2px_4px_rgb(14_14_16/0.05),0_24px_44px_-20px_rgb(14_14_16/0.32)] ring-1 ring-ink/[0.06]">
      <Image
        src={`/hero/${card.src}.webp`}
        alt=""
        fill
        sizes="(min-width: 1280px) 216px, (min-width: 640px) 18vw, 31vw"
        className="object-cover"
      />
      {/* Labels sit on the edge the search card doesn't cover. */}
      <figcaption
        className={cn(
          "absolute inset-x-2 flex sm:inset-x-3",
          labelAt === "top" ? "top-2 sm:top-3" : "bottom-2 sm:bottom-3",
        )}
      >
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 text-[0.65rem] font-medium text-ink shadow-card sm:text-xs">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              card.kind === "creator" ? "bg-brand-violet" : "bg-brand-coral",
            )}
          />
          <span className="truncate">
            {card.label}
            {card.platform && (
              <span className="hidden lg:inline"> · {card.platform}</span>
            )}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

function Row({ cards, place }: { cards: Card[]; place: "top" | "bottom" }) {
  return (
    <div
      className={cn(
        "flex justify-center gap-[3.5%] sm:justify-between sm:gap-0",
        place === "top" ? "items-end" : "items-start",
      )}
    >
      {cards.map((card, i) => {
        const shift = place === "top" ? ARCH[i] : `-${ARCH[i]}`;
        return (
          <div
            key={card.src}
            className={cn(
              "w-[31%] sm:w-[18.5%]",
              // Phones: the middle three only.
              (i === 0 || i === cards.length - 1) && "hidden sm:block",
            )}
            style={{ transform: `translateY(${shift})` }}
          >
            {/* The float lives on its own layer so it can't undo the arch. */}
            <div
              className="motion-safe:animate-float"
              style={
                {
                  animationDelay: `${-(i * 1.7 + (place === "top" ? 0 : 4))}s`,
                } as CSSProperties
              }
            >
              <PhotoCard
                card={card}
                labelAt={place === "top" ? "top" : "bottom"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The landing hero's centrepiece: the creator search (passed as children)
 * sitting on top of two arches of sample creators and businesses, one above
 * and one below, that close into a ring at the sides.
 */
export function HeroOrbit({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate">
      <div role="img" aria-label={ARIA_LABEL}>
        <Row cards={TOP} place="top" />
      </div>

      {/* Over the photos: it overlaps the bottom of the top row and the top
          of the bottom row. From 1280px it is a little narrower than the
          photos so the outer ones show beside it. */}
      <div className="relative z-10 -mt-10 sm:-mt-12 lg:-mt-14 xl:mx-[6%]">
        {children}
      </div>

      <div aria-hidden="true" className="-mt-10 sm:-mt-12 lg:-mt-14">
        <Row cards={BOTTOM} place="bottom" />
      </div>
    </div>
  );
}
