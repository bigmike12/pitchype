import { HeartHandshake, MapPin, Wallet } from "lucide-react";

import { ClayTile, type Tone } from "@/components/brand/stickers";
import { cn } from "@/lib/utils";

const POINTS: {
  icon: typeof Wallet;
  tone: Tone;
  title: string;
  text: string;
}[] = [
  {
    icon: Wallet,
    tone: "mint",
    title: "Plannable",
    text: "A price agreed before any work starts, so the budget is clear from the first day.",
  },
  {
    icon: HeartHandshake,
    tone: "rose",
    title: "Personal",
    text: "Recommendations from people their followers already know and listen to.",
  },
  {
    icon: MapPin,
    tone: "sky",
    title: "Local",
    text: "Filter creators by location, niche and followers, so you find the ones near your customers.",
  },
];

// What the marquee shows: kinds of creators and kinds of work. Descriptive
// only (no brand names, no counts), so nothing here can overstate.
const NICHES = [
  "Food & drink",
  "Beauty",
  "Fashion",
  "Tech",
  "Fitness",
  "Lifestyle",
  "Comedy",
  "Parenting",
  "Travel",
  "Music",
  "Gaming",
  "Money",
];
const WORK = [
  "Instagram reels",
  "TikTok videos",
  "YouTube shorts",
  "Story mentions",
  "Unboxings",
  "Product reviews",
  "Event coverage",
  "X threads",
  "Giveaways",
  "Tutorials",
];

/**
 * A row of pills that scrolls forever. The list is drawn twice so the loop
 * is seamless; the copy is hidden from assistive tech. With reduced motion
 * it stops and wraps instead.
 */
function Marquee({
  items,
  reverse = false,
  label,
}: {
  items: string[];
  reverse?: boolean;
  label: string;
}) {
  return (
    <div className="group overflow-hidden py-1 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)] motion-reduce:[mask-image:none]">
      <div
        className={cn(
          "flex w-max motion-safe:animate-marquee motion-safe:group-hover:[animation-play-state:paused] motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center",
          reverse && "[animation-direction:reverse]",
        )}
      >
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            aria-label={copy === 0 ? label : undefined}
            aria-hidden={copy === 1 ? true : undefined}
            className={cn(
              // Padding, not a gap between the copies, so -50% lands exactly.
              "flex shrink-0 gap-3 pr-3 motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:pr-0",
              copy === 1 && "motion-reduce:hidden",
            )}
          >
            {items.map((item) => (
              <li
                key={item}
                className="rounded-full px-4 py-2 text-[0.9375rem] font-medium whitespace-nowrap text-ink panel"
              >
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export function CreatorsBand() {
  return (
    <section aria-labelledby="creators-band-title" className="section-y">
      <div className="space-y-3">
        <Marquee items={NICHES} label="Creator niches" />
        <Marquee items={WORK} label="Kinds of work" reverse />
      </div>

      <div className="container-page mt-16 grid gap-10 lg:mt-24 lg:grid-cols-12">
        <h2 id="creators-band-title" className="text-display-lg lg:col-span-5">
          Built for micro and nano creators
        </h2>
        <div className="lg:col-span-7">
          <p className="max-w-[40rem] text-lg">
            You don’t need a celebrity to sell a product. Creators with a few
            thousand to around 100,000 followers tend to have smaller, closer
            audiences, and a recommendation from someone they follow can feel
            more personal than an ad. A smaller budget also goes further: you
            can work with several creators instead of betting everything on one.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {POINTS.map(({ icon, tone, title, text }) => (
              <li key={title} className="rounded-card p-5 panel">
                <ClayTile icon={icon} tone={tone} />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-[0.9375rem] text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
