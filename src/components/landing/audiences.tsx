import { Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { BUSINESS_FEE_BPS, formatRate } from "@/lib/fees";
import { cn } from "@/lib/utils";

import type { WaitlistRole } from "./waitlist-input";

type Audience = {
  id: string;
  role: WaitlistRole;
  title: string;
  intro: string;
  points: string[];
  cta: string;
  card: string;
  bullet: string;
  button: "light" | "default";
};

const AUDIENCES: Audience[] = [
  {
    id: "for-businesses",
    role: "business",
    title: "For businesses",
    intro:
      "Reach the people who already follow creators in your niche and your city.",
    points: [
      "Find creators by niche, platform, location, audience size and price.",
      "Set a price per creator, or agree one in chat.",
      "Your money is held until you approve the work.",
      `No subscription. A ${formatRate(BUSINESS_FEE_BPS)} service fee, only on jobs you fund.`,
    ],
    cta: "Join as a business",
    card: "bg-brand-green on-dark",
    bullet: "bg-brand-mint text-ink",
    button: "light",
  },
  {
    id: "for-creators",
    role: "creator",
    title: "For creators",
    intro: "Paid work from brands that fit you, without chasing invoices.",
    points: [
      "Browse open campaigns that match your niche and city.",
      "Apply at the listed price or propose your own.",
      "Start once the business has paid, so the money is already there.",
      "Get paid when your work is approved, or automatically after 7 days of silence.",
    ],
    cta: "Join as a creator",
    card: "bg-brand-sun text-ink",
    bullet: "bg-ink text-white",
    button: "default",
  },
];

export function Audiences() {
  return (
    <section
      aria-label="Who Pitchype is for"
      className="mx-auto max-w-7xl px-4 section-y sm:px-6 lg:px-8"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {AUDIENCES.map((audience) => (
          <article
            key={audience.id}
            id={audience.id}
            aria-labelledby={`${audience.id}-title`}
            className={cn(
              "flex flex-col rounded-3xl p-6 sm:p-10",
              audience.card,
            )}
          >
            <h2 id={`${audience.id}-title`} className="text-display-lg">
              {audience.title}
            </h2>
            <p className="mt-3 text-lg">{audience.intro}</p>
            <ul className="mt-8 mb-10 space-y-4">
              {audience.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      audience.bullet,
                    )}
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <a
              href="#waitlist"
              data-waitlist-role={audience.role}
              className={buttonVariants({
                size: "lg",
                variant: audience.button,
                className: "mt-auto self-start",
              })}
            >
              {audience.cta}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
