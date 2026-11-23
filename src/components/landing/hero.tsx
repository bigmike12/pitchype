import type { CSSProperties } from "react";

import { HeroIcons } from "./hero-icons";
import { HeroOrbit } from "./hero-orbit";
import { HeroSearch } from "./hero-search";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export function Hero() {
  // Pulled up under the floating header so the white runs behind its glass.
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate -mt-14 overflow-hidden bg-surface pt-14 sm:-mt-16 sm:pt-16"
    >
      <HeroIcons />

      <div className="container-page pt-12 text-center sm:pt-20 lg:pt-24">
        {/* One block per sentence so lines never break across the full stop. */}
        <h1
          id="hero-title"
          className="mx-auto mt-6 max-w-[22ch] text-display-xl enter"
          style={delay(60)}
        >
          <span className="block">
            Brands <span className="text-gradient">hire.</span>
          </span>{" "}
          <span className="block">Creators <span className="text-gradient">earn.</span></span>
        </h1>
      </div>

      <div
        className="container-page mt-10 pb-16 sm:mt-14 lg:mt-16 lg:pb-20 enter"
        style={delay(140)}
      >
        {/* Experiment (2026-11-23): the creator search on a ring of sample
            creators and businesses, in place of HeroIllustration
            (./hero-illustration), which is kept to switch back. */}
        <HeroOrbit>
          <HeroSearch />
        </HeroOrbit>
      </div>
    </section>
  );
}
