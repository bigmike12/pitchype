import { buttonVariants } from "@/components/ui/button";

import { HeroIllustration } from "./hero-illustration";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="container-page pt-10 pb-16 sm:pt-14 lg:pt-20 lg:pb-24"
    >
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          {/* One block per sentence so lines never break across the full stop. */}
          <h1 id="hero-title" className="text-display-xl">
            <span className="block">Brands meet creators.</span>{" "}
            <span className="block">Everybody gets paid.</span>
          </h1>
          <p className="mt-6 max-w-[36rem] text-lg sm:text-xl">
            Post a campaign, choose the creators you like, and pay safely
            through escrow. Creators apply, do the work, and get paid when it’s
            approved.
          </p>
          {/* Plain links to the form, so they work before (or without) JavaScript.
              The form reads data-waitlist-role to preselect the right option. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#waitlist"
              data-waitlist-role="business"
              className={buttonVariants({ size: "lg" })}
            >
              I’m a business
            </a>
            <a
              href="#waitlist"
              data-waitlist-role="creator"
              className={buttonVariants({ size: "lg", variant: "secondary" })}
            >
              I’m a creator
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">
            Free to join. Fees only apply to jobs that get funded.
          </p>
        </div>

        <div className="lg:col-span-5">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
