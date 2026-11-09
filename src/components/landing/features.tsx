import { Check, Clock, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { EXAMPLE_PRICE_KOBO, feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

import { Avatar, Chip, ProductFragment } from "@/components/brand/fragments";

const job = feeExample(EXAMPLE_PRICE_KOBO);

type Feature = {
  title: string;
  text: string;
  // Order matters: the colours cycle so no two neighbours match at 1, 2 or 3 columns.
  card: string;
  fragment: ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Safe by default",
    text: "The business pays up front, and the money is held until the work is approved.",
    card: "bg-brand-coral text-ink",
    fragment: (
      <ProductFragment
        label={`payment timeline: ${formatNaira(job.businessPaysKobo)} paid, ${formatNaira(job.agreedPriceKobo)} held in escrow, released after approval`}
      >
        <ol className="space-y-2.5 pr-14 text-xs">
          <li className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-brand-green text-white">
              <Check className="size-3.5" aria-hidden="true" />
            </span>
            <span>
              Paid by business <b>{formatNaira(job.businessPaysKobo)}</b>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-brand-mint">
              <Lock className="size-3.5" aria-hidden="true" />
            </span>
            <span>
              Held in escrow <b>{formatNaira(job.agreedPriceKobo)}</b>
            </span>
          </li>
          <li className="flex items-center gap-2 text-muted">
            <span className="size-6 rounded-full border-2 border-dashed border-field" />
            Released when work is approved
          </li>
        </ol>
      </ProductFragment>
    ),
  },
  {
    title: "Find the right creators",
    text: "Filter by niche, platform, location, followers and price.",
    card: "bg-brand-green on-dark",
    fragment: (
      <ProductFragment label="creator search filtered to fashion creators in Lagos, showing two results">
        <div className="flex flex-wrap gap-1 pr-14">
          <Chip>Fashion</Chip>
          <Chip>Lagos</Chip>
          <Chip>5k–50k followers</Chip>
        </div>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-2">
            <Avatar initials="AO" colour="sun" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Amaka O.</span>
              <span className="block text-xs text-muted">18k followers</span>
            </span>
            <span className="text-xs font-semibold">from ₦35,000</span>
          </li>
          <li className="flex items-center gap-2">
            <Avatar initials="DE" colour="peach" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Dayo E.</span>
              <span className="block text-xs text-muted">9k followers</span>
            </span>
            <span className="text-xs font-semibold">from ₦20,000</span>
          </li>
        </ul>
      </ProductFragment>
    ),
  },
  {
    title: "Chat and negotiate",
    text: "Agree the price and the details before anyone starts.",
    card: "bg-brand-lilac text-ink",
    fragment: (
      <ProductFragment label="a chat where a business and a creator agree on two reels for ₦60,000">
        <div className="space-y-2 pt-6 text-xs">
          <p className="mr-8 rounded-card rounded-bl-md bg-surface-card px-3 py-2">
            Could you do two reels instead of one?
          </p>
          <p className="ml-8 rounded-card rounded-br-md bg-ink px-3 py-2 text-white">
            Yes, for ₦60,000 total. I can post by Friday.
          </p>
          <p className="mr-8 rounded-card rounded-bl-md bg-surface-card px-3 py-2">
            Deal. Updating the offer now.
          </p>
        </div>
      </ProductFragment>
    ),
  },
  {
    title: "7-day auto-release",
    text: "If a business doesn’t respond to submitted work within 7 days, the creator is paid automatically.",
    card: "bg-brand-sun text-ink",
    fragment: (
      <ProductFragment label="submitted work with 5 of 7 review days used, auto-release in 2 days">
        <p className="flex items-center gap-1.5 pr-14 font-semibold">
          <Clock className="size-4" aria-hidden="true" /> Waiting for review
        </p>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 7 }, (_, day) => (
            <span
              key={day}
              className={cn(
                "h-2 flex-1 rounded-full",
                day < 5 ? "bg-ink" : "bg-surface-card",
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Pays out automatically in 2 days
        </p>
      </ProductFragment>
    ),
  },
  {
    title: "Clear approvals",
    text: "Businesses accept the work or decline it with reasons. No silent rejections.",
    card: "bg-brand-peach text-ink",
    fragment: (
      <ProductFragment label="declined work with two reasons: the logo is hidden and the discount code is missing">
        <p className="pr-14 font-semibold">Changes requested</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
          <li>Logo isn’t visible in the first 3 seconds</li>
          <li>Caption is missing the discount code</li>
        </ul>
        <p className="mt-3 inline-flex rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white">
          Resubmit
        </p>
      </ProductFragment>
    ),
  },
  {
    title: "Simple wallet and payouts",
    text: "Earnings land in your wallet. Cash out to your bank, with any transfer fee shown up front.",
    card: "bg-brand-mint text-ink",
    fragment: (
      <ProductFragment
        label={`a wallet with a balance of ₦97,500 after a payment of ${formatNaira(job.influencerReceivesKobo)}`}
      >
        <p className="text-xs text-muted">Wallet balance</p>
        <p className="font-display text-2xl">₦97,500</p>
        <p className="mt-1 text-xs">
          <span className="font-semibold">
            +{formatNaira(job.influencerReceivesKobo)}
          </span>{" "}
          Brightside Juice campaign
        </p>
        <p className="mt-3 rounded-lg bg-ink py-2 text-center text-xs font-semibold text-white">
          Cash out to bank
        </p>
        <p className="mt-1.5 text-center text-[0.7rem] text-muted">
          Transfer fee shown before you confirm
        </p>
      </ProductFragment>
    ),
  },
];

export function Features() {
  return (
    <section
      aria-labelledby="features-title"
      className="container-page section-y"
    >
      <h2 id="features-title" className="max-w-[18ch] text-display-lg">
        Fair for businesses. Fair for creators.
      </h2>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className={cn(
              "flex flex-col rounded-panel p-6 sm:p-8",
              feature.card,
            )}
          >
            <h3 className="text-display-md">{feature.title}</h3>
            <p className="mt-2 mb-6">{feature.text}</p>
            <div className="mt-auto">{feature.fragment}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
