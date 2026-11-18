import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";

/** The closing call to action on an audience page: one account, one button. */
export function AudienceCta({
  title,
  text,
  cta,
}: {
  title: ReactNode;
  text: string;
  cta: { href: string; label: string };
}) {
  return (
    <section
      aria-labelledby="audience-cta-title"
      className="container-page section-y"
    >
      <div className="relative isolate overflow-hidden rounded-frame px-5 py-14 text-center ring-1 ring-hairline aurora motion-safe:animate-aurora sm:px-10 lg:py-24">
        <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid" />
        <h2
          id="audience-cta-title"
          className="mx-auto max-w-[18ch] text-display-lg reveal"
        >
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-[34rem] text-lg text-ink reveal">
          {text}
        </p>
        <div className="mt-9 flex justify-center reveal">
          <Link
            href={cta.href}
            className={buttonVariants({
              size: "lg",
              className: "group w-full sm:w-auto",
            })}
          >
            {cta.label}
            <ArrowRight
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            />
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
