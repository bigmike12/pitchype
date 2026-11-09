import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { EXAMPLE_PRICE_KOBO, feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

import { Avatar, Chip, ProductFragment } from "@/components/brand/fragments";
import { HowItWorksTabs } from "./how-it-works-tabs";

type Step = { title: string; text: string; fragment: ReactNode };

// One ₦50,000 job runs through both lists so the numbers line up.
const job = feeExample(EXAMPLE_PRICE_KOBO);
const price = formatNaira(job.agreedPriceKobo);

const BUSINESS_STEPS: Step[] = [
  {
    title: "Post a campaign",
    text: "Describe the job, who you’re looking for, and what you’ll pay each creator.",
    fragment: (
      <ProductFragment
        label={`a new campaign paying ${price} per creator, 5 creators needed`}
      >
        <p className="font-semibold">New campaign</p>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Per creator</dt>
            <dd className="font-semibold">{price}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Creators needed</dt>
            <dd className="font-semibold">5</dd>
          </div>
        </dl>
      </ProductFragment>
    ),
  },
  {
    title: "Review applications",
    text: "Creators who fit apply. Compare profiles and prices, and chat to agree the details.",
    fragment: (
      <ProductFragment
        label={`an application from a creator called Tunde at ${price}`}
      >
        <div className="flex items-center gap-2 pr-14">
          <Avatar initials="TA" colour="lilac" />
          <div>
            <p className="font-semibold">Tunde A.</p>
            <p className="text-xs text-muted">Tech, 12k followers</p>
          </div>
        </div>
        <p className="mt-2 text-xs">
          Accepts <span className="font-semibold">{price}</span>
        </p>
      </ProductFragment>
    ),
  },
  {
    title: "Approve and fund",
    text: "Approve the creators you want and pay into escrow. The money is held until the work is approved.",
    fragment: (
      <ProductFragment
        label={`${formatNaira(job.businessPaysKobo)} paid, ${price} held in escrow`}
      >
        <p className="text-xs text-muted">You paid</p>
        <p className="font-semibold">{formatNaira(job.businessPaysKobo)}</p>
        <p className="mt-2 inline-flex rounded-full bg-brand-mint px-2.5 py-1 text-xs font-semibold">
          {price} held in escrow
        </p>
      </ProductFragment>
    ),
  },
  {
    title: "Approve the work",
    text: "Check what they deliver. Accept it and the creator is paid, or decline with reasons.",
    fragment: (
      <ProductFragment label="buttons to accept the work or decline it with reasons">
        <p className="font-semibold">Work submitted</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded-lg bg-ink px-2.5 py-1.5 text-white">
            Accept
          </span>
          <span className="rounded-lg border border-field px-2.5 py-1.5">
            Decline with reasons
          </span>
        </div>
      </ProductFragment>
    ),
  },
];

const CREATOR_STEPS: Step[] = [
  {
    title: "Create your profile",
    text: "Add your platforms, niche, city and audience so the right brands can find you.",
    fragment: (
      <ProductFragment label="a creator profile for Zainab, a beauty creator on TikTok in Abuja">
        <div className="flex items-center gap-2 pr-14">
          <Avatar initials="ZB" colour="coral" />
          <p className="font-semibold">Zainab B.</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip>Beauty</Chip>
          <Chip>TikTok</Chip>
          <Chip>Abuja</Chip>
        </div>
      </ProductFragment>
    ),
  },
  {
    title: "Find campaigns",
    text: "Browse open campaigns and filter by niche, platform, location and budget.",
    fragment: (
      <ProductFragment label="campaign filters for food and drink, in Lagos, paying ₦20,000 or more">
        <p className="font-semibold">Filters</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip className="border-ink bg-ink text-white">Food &amp; drink</Chip>
          <Chip className="border-ink bg-ink text-white">Lagos</Chip>
          <Chip>₦20,000+</Chip>
        </div>
      </ProductFragment>
    ),
  },
  {
    title: "Apply or negotiate",
    text: "Apply at the listed price or propose your own. You only start once the job is funded.",
    fragment: (
      <ProductFragment
        label={`a proposal of ${price} on a campaign listed at ₦40,000`}
      >
        <p className="text-xs text-muted">
          Listed at <span className="line-through">₦40,000</span>
        </p>
        <p className="font-semibold">Your price: {price}</p>
        <p className="mt-2 inline-flex rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white">
          Send proposal
        </p>
      </ProductFragment>
    ),
  },
  {
    title: "Deliver and get paid",
    text: "Submit your work. Once it’s approved, or after 7 days with no reply, the money is yours.",
    fragment: (
      <ProductFragment
        label={`work approved, ${formatNaira(job.influencerReceivesKobo)} added to the wallet`}
      >
        <p className="inline-flex items-center gap-1 text-xs font-semibold">
          <Check className="size-3.5" aria-hidden="true" /> Approved
        </p>
        <p className="mt-1 font-semibold">
          +{formatNaira(job.influencerReceivesKobo)}
        </p>
        <p className="text-xs text-muted">added to your wallet</p>
      </ProductFragment>
    ),
  },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex flex-col rounded-panel bg-surface-card p-5 sm:p-6"
        >
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-ink font-display text-white"
          >
            {index + 1}
          </span>
          <h3 className="mt-4 text-display-md">{step.title}</h3>
          <p className="mt-2 mb-6 text-[0.9375rem]">{step.text}</p>
          <div className="mt-auto">{step.fragment}</div>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="container-page section-y"
    >
      <h2 id="how-it-works-title" className="text-display-lg">
        How it works
      </h2>
      <p className="mt-4 mb-8 max-w-[36rem] text-lg">
        Four steps from first post to payday, whichever side you’re on.
      </p>
      <HowItWorksTabs
        business={<StepList steps={BUSINESS_STEPS} />}
        creator={<StepList steps={CREATOR_STEPS} />}
      />
    </section>
  );
}
