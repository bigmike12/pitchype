import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { BUSINESS_PAGE, CREATOR_PAGE } from "@/lib/signup-link";
import { cn } from "@/lib/utils";

// The home page's way into each audience page. The depth (calculators,
// sourced figures, how the money moves) lives on /for-creators and
// /for-business. The ids keep old links to /#for-creators and
// /#for-businesses landing on the right card.

function SideCard({
  id,
  eyebrow,
  title,
  lead,
  page,
  signUp,
  surface,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead: string;
  page: { href: string; label: string };
  signUp: { href: string; label: string };
  surface: "aurora" | "aurora-warm";
}) {
  const titleId = `${id}-title`;
  return (
    <article
      id={id}
      aria-labelledby={titleId}
      className={cn(
        "relative isolate flex flex-col overflow-hidden rounded-frame p-6 ring-1 ring-hairline reveal sm:p-10",
        surface,
      )}
    >
      <p className="inline-flex self-start rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-ink ring-1 ring-ink/[0.06]">
        {eyebrow}
      </p>
      <h3 id={titleId} className="mt-4 text-display-lg">
        {title}
      </h3>
      <p className="mt-4 text-lg text-ink">{lead}</p>
      <div className="mt-8 flex flex-col gap-3 sm:mt-auto sm:flex-row sm:items-center sm:pt-8">
        <Link
          href={page.href}
          className={buttonVariants({ size: "lg", className: "group" })}
        >
          {page.label}
          <ArrowRight
            aria-hidden="true"
            className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
          />
        </Link>
        <Link href={signUp.href} className="link text-center sm:px-2">
          {signUp.label}
        </Link>
      </div>
    </article>
  );
}

export function AudienceSplit() {
  return (
    <section
      aria-labelledby="audience-split-title"
      className="container-page section-y"
    >
      <h2 id="audience-split-title" className="text-display-lg reveal">
        Whichever side you’re on
      </h2>
      <p className="mt-4 max-w-[36rem] text-lg reveal">
        Pitchype works differently for creators and for businesses. Pick yours
        to see how.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <SideCard
          id="for-creators"
          eyebrow="For creators"
          title={
            <>
              Your influence should pay{" "}
              <span className="text-gradient">before you’re famous.</span>
            </>
          }
          lead="No follower minimum. Apply to paid campaigns, start once the money is held in escrow, and get paid when the work is approved."
          page={{ href: CREATOR_PAGE, label: "See how it works for creators" }}
          signUp={{
            href: "/signup?role=influencer",
            label: "Join as a creator",
          }}
          surface="aurora-warm"
        />
        <SideCard
          id="for-businesses"
          eyebrow="For businesses"
          title={
            <>
              Make your marketing budget{" "}
              <span className="text-gradient">work harder.</span>
            </>
          }
          lead="Find creators who fit, agree the price up front and pay through escrow. Your money is held until you approve the work."
          page={{
            href: BUSINESS_PAGE,
            label: "See how it works for businesses",
          }}
          signUp={{
            href: "/signup?role=business",
            label: "Join as a business",
          }}
          surface="aurora"
        />
      </div>
    </section>
  );
}
