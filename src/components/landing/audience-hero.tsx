import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

/**
 * The top of an audience page (/for-business, /for-creators): the same
 * aurora and entrance as the home hero, with one sign-up button for that
 * side and no illustration.
 */
export function AudienceHero({
  eyebrow,
  title,
  lead,
  primaryCta,
  note,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  primaryCta: { href: string; label: string };
  note?: string;
}) {
  // Pulled up under the floating header so the aurora shows through its glass.
  return (
    <section
      aria-labelledby="audience-hero-title"
      className="relative isolate -mt-14 overflow-hidden pt-14 sm:-mt-16 sm:pt-16"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 aurora [mask-image:linear-gradient(#000_45%,transparent_92%)] motion-safe:animate-aurora"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid" />

      <div className="container-page pt-12 pb-10 text-center sm:pt-20 sm:pb-12 lg:pt-24">
        <p
          className="inline-flex rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-ink ring-1 ring-ink/[0.06] enter"
          style={delay(0)}
        >
          {eyebrow}
        </p>
        <h1
          id="audience-hero-title"
          className="mx-auto mt-6 max-w-[18ch] text-display-xl enter"
          style={delay(60)}
        >
          {title}
        </h1>
        <p
          className="mx-auto mt-6 max-w-[38rem] text-lg sm:text-xl enter"
          style={delay(120)}
        >
          {lead}
        </p>
        <div className="mt-9 flex justify-center enter" style={delay(170)}>
          <Link
            href={primaryCta.href}
            className={buttonVariants({
              size: "lg",
              className: "group w-full sm:w-auto",
            })}
          >
            {primaryCta.label}
            <ArrowRight
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        {note && (
          <p className="mt-4 text-sm text-muted enter" style={delay(210)}>
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
