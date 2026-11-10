import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { BUSINESS_FEE_BPS, INFLUENCER_FEE_BPS, formatRate } from "@/lib/fees";
import { cn } from "@/lib/utils";

import { BudgetSplitter } from "./budget-splitter";
import { EarningsCalculator } from "./earnings-calculator";
import { BUSINESS_STATS, CREATOR_STATS, StatGrid, type Stat } from "./stats";

// The two sides of the sale, one section each: why it's better, what you
// get, a calculator to play with, and the outside figures behind the
// argument (each with its source; see ./stats.tsx).

export function ForCreators() {
  return (
    <AudienceSection
      id="for-creators"
      eyebrow="For creators"
      title={
        <>
          Your influence should pay{" "}
          <span className="text-gradient">before you’re famous.</span>
        </>
      }
      lead="You don’t need 10,000 followers to be worth paying. Businesses on Pitchype pay for posts, reviews and videos from creators their customers already trust, with the money held safely before you start."
      points={[
        "No follower minimum to join.",
        "Browse open campaigns that match your niche and city, or get found in the directory.",
        "Apply at the listed price or propose your own.",
        "Start once the business has paid, so the money is already there.",
        "Get paid when your work is approved, or automatically after 7 days of silence.",
        `A ${formatRate(INFLUENCER_FEE_BPS)} fee only when you’re paid. No subscription.`,
      ]}
      cta={{
        href: "/signup?role=influencer",
        label: "Create a creator account",
      }}
      tool={<EarningsCalculator />}
      surface="aurora-warm"
      stats={CREATOR_STATS}
      statsLabel="Why platform payouts aren’t enough"
    />
  );
}

export function ForBusinesses() {
  return (
    <AudienceSection
      id="for-businesses"
      eyebrow="For businesses"
      title={
        <>
          Make your marketing budget{" "}
          <span className="text-gradient">work harder.</span>
        </>
      }
      lead="One big influencer is one audience and one bet. The same budget can pay several creators whose followers are your customers, so you reach more of the right people and learn who actually moves them."
      points={[
        "Find creators by niche, platform, location, audience size and price.",
        "Spread one budget across several creators, niches and cities.",
        "Set a price per creator, or agree one in chat.",
        "Your money is held until you approve the work.",
        `No subscription. A ${formatRate(BUSINESS_FEE_BPS)} service fee, only on jobs you fund.`,
      ]}
      cta={{
        href: "/signup?role=business",
        label: "Create a business account",
      }}
      tool={<BudgetSplitter />}
      surface="aurora"
      stats={BUSINESS_STATS}
      statsLabel="What brands are finding"
      flip
    />
  );
}

function AudienceSection({
  id,
  eyebrow,
  title,
  lead,
  points,
  cta,
  tool,
  surface,
  stats,
  statsLabel,
  flip = false,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead: string;
  points: string[];
  cta: { href: string; label: string };
  tool: ReactNode;
  surface: "aurora" | "aurora-warm";
  stats: Stat[];
  statsLabel: string;
  /** Put the calculator on the left from 1024px, for rhythm down the page. */
  flip?: boolean;
}) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="container-page section-y"
    >
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-frame p-5 ring-1 ring-hairline sm:p-10 lg:p-14",
          surface,
        )}
      >
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className={cn(flip && "lg:order-last")}>
            <p className="inline-flex rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-ink ring-1 ring-ink/[0.06] reveal">
              {eyebrow}
            </p>
            <h2 id={titleId} className="mt-4 text-display-lg reveal">
              {title}
            </h2>
            <p className="mt-4 text-lg text-ink reveal">{lead}</p>
            <ul className="mt-6 space-y-3">
              {points.map((point) => (
                <li key={point} className="flex gap-3 text-ink reveal">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink text-white">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href={cta.href}
              className={buttonVariants({
                size: "lg",
                className: "group mt-8 w-full sm:w-auto",
              })}
            >
              {cta.label}
              <ArrowRight
                aria-hidden="true"
                className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
              />
            </Link>
          </div>
          <div className="reveal">{tool}</div>
        </div>
      </div>

      <h3 className="mt-10 text-base font-semibold text-ink">{statsLabel}</h3>
      <StatGrid stats={stats} label={statsLabel} className="mt-4" />
      <p className="mt-3 text-xs text-muted">
        Global and US figures, checked November 2026. There are no Nigerian
        benchmarks yet; we’ll publish our own as Pitchype grows.
      </p>
    </section>
  );
}
