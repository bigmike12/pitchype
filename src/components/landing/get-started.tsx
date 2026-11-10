import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/** The closing call to action: one account for each side. */
export function GetStarted() {
  return (
    <section
      id="get-started"
      aria-labelledby="get-started-title"
      className="container-page section-y"
    >
      <div className="relative isolate overflow-hidden rounded-frame px-5 py-14 text-center ring-1 ring-hairline aurora motion-safe:animate-aurora sm:px-10 lg:py-24">
        <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid" />
        <h2
          id="get-started-title"
          className="mx-auto max-w-[16ch] text-display-lg reveal"
        >
          One platform. <span className="text-gradient">Two ways to win.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-[34rem] text-lg text-ink reveal">
          Creators: get discovered, get booked, get paid. Businesses: find
          creators, run campaigns, pay only for work you approve.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row reveal">
          <Link
            href="/signup?role=business"
            className={buttonVariants({ size: "lg", className: "group" })}
          >
            Join as a business
            <ArrowRight
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/signup?role=influencer"
            className={buttonVariants({ size: "lg", variant: "secondary" })}
          >
            Join as a creator
          </Link>
        </div>
        <p className="mt-5 text-sm text-ink reveal">
          Already have an account?{" "}
          <Link href="/login" className="link">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}
