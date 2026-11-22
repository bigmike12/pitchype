import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { buttonVariants } from "@/components/ui/button";

import { HeroIllustration } from "./hero-illustration";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export function Hero() {
  // Pulled up under the floating header so the aurora shows through its glass.
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate -mt-14 overflow-hidden pt-14 sm:-mt-16 sm:pt-16"
    >
      {/* Backdrop: a drifting aurora that fades into the page, and a dot grid. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 aurora [mask-image:linear-gradient(#000_45%,transparent_92%)] motion-safe:animate-aurora"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid" />

      <div className="container-page pt-12 text-center sm:pt-20 lg:pt-24">
        {/* One block per sentence so lines never break across the full stop. */}
        <h1
          id="hero-title"
          className="mx-auto mt-6 max-w-[22ch] text-display-xl enter"
          style={delay(60)}
        >
          <span className="block">
            Hire <span className="text-gradient">creators.</span>
          </span>{" "}
          <span className="block">Get paid for your work.</span>
        </h1>
        <p
          className="mx-auto mt-6 max-w-[38rem] text-lg sm:text-xl enter"
          style={delay(120)}
        >
          Pitchype connects Nigerian businesses with micro and nano creators for
          paid campaigns. Agree the price up front, pay into escrow, and keep
          the money held until the work is approved or 7 days pass without a
          reply.
        </p>

        {/* Sign-up opens with the matching account type already chosen. */}
        <div
          className="mt-9 flex flex-col justify-center gap-3 sm:flex-row enter"
          style={delay(170)}
        >
          <Link
            href="/signup?role=business"
            className={buttonVariants({ size: "lg", className: "group" })}
          >
            I’m a business
            <ArrowRight
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/signup?role=influencer"
            className={buttonVariants({ size: "lg", variant: "secondary" })}
          >
            I’m a creator
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted enter" style={delay(210)}>
          Free to join, with no follower minimum. Fees only apply to jobs that
          get funded.
        </p>
      </div>

      <div
        className="container-page mt-14 pb-16 sm:mt-20 enter"
        style={delay(280)}
      >
        <HeroIllustration />
      </div>
    </section>
  );
}
