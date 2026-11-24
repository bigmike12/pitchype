import {
  AtSign,
  Heart,
  MessageCircle,
  Play,
  Send,
  ThumbsUp,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { PlatformIcon } from "@/components/creators/platform-icon";
import { cn } from "@/lib/utils";

// Social icons scattered behind the hero: the platforms creators post on and
// the reactions their posts get. Decoration only.
type Spot = {
  icon: ReactNode;
  tint: string;
  left: string;
  top: string;
  tilt: number;
  // Where it shows: everywhere, from 1024px (beside the headline), or from
  // 1280px (in the margins beside the photos, which only exist from there).
  from?: "lg" | "xl";
};

const ICON = "size-5";

const SPOTS: Spot[] = [
  // Beside the first line of the headline, on every screen (clear of the
  // floating header, which the hero runs under).
  {
    icon: <PlatformIcon platform="instagram" className={ICON} />,
    tint: "bg-brand-lilac",
    left: "7%",
    top: "17%",
    tilt: -8,
  },
  {
    icon: <PlatformIcon platform="tiktok" className={ICON} />,
    tint: "bg-brand-rose",
    left: "93%",
    top: "16%",
    tilt: 7,
  },
  // Beside the headline.
  {
    icon: <MessageCircle className={ICON} />,
    tint: "bg-brand-mint",
    left: "22%",
    top: "11%",
    tilt: 6,
    from: "lg",
  },
  {
    icon: <PlatformIcon platform="x" className={ICON} />,
    tint: "bg-brand-sun",
    left: "78%",
    top: "12%",
    tilt: -6,
    from: "lg",
  },
  {
    icon: <Heart className={ICON} />,
    tint: "bg-brand-peach",
    left: "9%",
    top: "28%",
    tilt: 8,
    from: "lg",
  },
  {
    icon: <PlatformIcon platform="youtube" className={ICON} />,
    tint: "bg-brand-sky",
    left: "91%",
    top: "27%",
    tilt: -7,
    from: "lg",
  },
  // Margins beside the photos.
  {
    icon: <Play className={ICON} />,
    tint: "bg-brand-lilac",
    left: "3.5%",
    top: "52%",
    tilt: -6,
    from: "xl",
  },
  {
    icon: <Send className={ICON} />,
    tint: "bg-brand-rose",
    left: "96.5%",
    top: "57%",
    tilt: 8,
    from: "xl",
  },
  {
    icon: <AtSign className={ICON} />,
    tint: "bg-brand-mint",
    left: "3.5%",
    top: "80%",
    tilt: 7,
    from: "xl",
  },
  {
    icon: <ThumbsUp className={ICON} />,
    tint: "bg-brand-peach",
    left: "96.5%",
    top: "84%",
    tilt: -8,
    from: "xl",
  },
];

export function HeroIcons() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {SPOTS.map((spot, i) => (
        <div
          key={i}
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2",
            spot.from === "lg" && "hidden lg:block",
            spot.from === "xl" && "hidden xl:block",
          )}
          style={{ left: spot.left, top: spot.top }}
        >
          <div
            className={cn(
              "grid size-10 place-items-center rounded-control text-ink shadow-card ring-1 ring-ink/5 [transform:rotate(var(--tilt))] motion-safe:animate-float-slow sm:size-12",
              spot.tint,
            )}
            style={
              {
                "--tilt": `${spot.tilt}deg`,
                animationDelay: `${-i * 1.1}s`,
              } as CSSProperties
            }
          >
            {spot.icon}
          </div>
        </div>
      ))}
    </div>
  );
}
