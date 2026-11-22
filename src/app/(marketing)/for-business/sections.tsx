import {
  ClipboardList,
  Clock,
  Link2,
  Lock,
  MessagesSquare,
  Scale,
  Search,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, Chip, ProductFragment } from "@/components/brand/fragments";
import { ClayTile, type Tone } from "@/components/brand/stickers";
import { FeeReceipt, BUSINESS_RECEIPT } from "@/components/landing/pricing";
import type { FaqItem } from "@/components/landing/faq";
import type { ComparisonRow } from "@/components/landing/why-pitchype";
import { MIN_CPC_NAIRA, MIN_PRICE_NAIRA } from "@/lib/campaign";
import {
  BUSINESS_FEE_BPS,
  EXAMPLE_PRICE_KOBO,
  MIN_FEE_KOBO,
  formatRate,
} from "@/lib/fees";
import { KOBO_PER_NAIRA, formatNaira } from "@/lib/money";

// Everything on this page describes what is built today. Nothing about
// features that don't exist yet (docs/superpowers/specs/2026-11-18-audience-
// pages-design.md).

export const WHY_ROWS: ComparisonRow[] = [
  {
    topic: "Finding creators",
    usual: "Cold DMs, agencies and friends of friends.",
    pitchype:
      "A directory you can filter by niche, platform, state, followers and rate, and campaigns that creators apply to.",
  },
  {
    topic: "Agreeing the price",
    usual: "Back and forth in DMs, and the price can move after work starts.",
    pitchype:
      "The price is on the campaign or in the application, and it’s locked once the job is paid for.",
  },
  {
    topic: "Paying",
    usual: "Pay upfront and hope, or pay afterwards and argue.",
    pitchype:
      "Your payment is held in escrow before the creator starts. It’s released when you accept the work, or if you don’t respond within 7 days.",
  },
  {
    topic: "Checking the work",
    usual: "Screenshots lost in chats and no clear yes or no.",
    pitchype:
      "Proof goes in one place. Accept it, or decline with your reasons and let the creator fix it.",
  },
  {
    topic: "When something goes wrong",
    usual: "You’re on your own.",
    pitchype:
      "The money stays held while Pitchype reviews the dispute and decides who gets it.",
  },
];

function Card({
  icon,
  tone,
  title,
  children,
  fragment,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  children: ReactNode;
  fragment: ReactNode;
}) {
  return (
    <li className="flex flex-col rounded-panel p-5 panel sm:p-6">
      <ClayTile icon={icon} tone={tone} size="lg" />
      <h3 className="mt-4 text-display-md">{title}</h3>
      <div className="mt-2 mb-6 space-y-3 text-[0.9375rem]">{children}</div>
      <div className="mt-auto">{fragment}</div>
    </li>
  );
}

export function HiringSection() {
  return (
    <section
      id="hiring"
      aria-labelledby="hiring-title"
      className="container-page section-y"
    >
      <h2 id="hiring-title" className="text-display-lg">
        Find, brief and hire creators
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg">
        Post a campaign that creators apply to, or message creators from their
        profiles. Either way, you approve the people you want at an agreed price
        and follow each hire on one board.
      </p>
      <ul className="grid gap-4 lg:grid-cols-3">
        <Card
          icon={Search}
          tone="mint"
          title="Browse the directory"
          fragment={
            <ProductFragment label="creator filters for fashion, Lagos, TikTok and 5K or more followers">
              <p className="font-semibold">Filters</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip className="border-ink bg-ink text-white">Fashion</Chip>
                <Chip className="border-ink bg-ink text-white">Lagos</Chip>
                <Chip>TikTok</Chip>
                <Chip>5K or more</Chip>
              </div>
            </ProductFragment>
          }
        >
          <p>
            Filter by niche, platform, state, follower range and rate, then open
            a profile to message the creator.
          </p>
          <p>
            Creators can verify an account by putting a code in their bio, and
            you can limit a campaign to verified creators only.
          </p>
        </Card>

        <Card
          icon={ClipboardList}
          tone="sky"
          title="Write a clear brief"
          fragment={
            <ProductFragment label="a campaign needing 5 creators, with two Instagram Reels and one TikTok video each">
              <p className="font-semibold">Product launch</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>2 × Instagram Reel</li>
                <li>1 × TikTok video</li>
              </ul>
            </ProductFragment>
          }
        >
          <p>
            Set the price per creator, how many you need, the deliverables
            (platform, type and quantity) and who can apply. Or pay per click on
            a tracked link, with a budget for each creator.
          </p>
          <p>
            Once a campaign is live its price and requirements are locked, so
            every creator applies to the same terms. Your first campaign is
            checked by our team before it goes live.
          </p>
        </Card>

        <Card
          icon={MessagesSquare}
          tone="lilac"
          title="Review, chat and hire"
          fragment={
            <ProductFragment label="a chat where a creator agrees to post on Friday">
              <div className="flex items-center gap-2">
                <Avatar initials="TA" colour="lilac" />
                <p className="rounded-xl bg-surface-soft px-2.5 py-1.5 text-xs">
                  Yes, I can post it on Friday.
                </p>
              </div>
            </ProductFragment>
          }
        >
          <p>
            Applications arrive with the creator’s price. Chat to agree the
            details, approve the ones you want, and follow every application and
            hire by stage on your hiring board.
          </p>
          <p>
            Phone numbers, email addresses and WhatsApp or Telegram links are
            blocked in chat, so deals stay on Pitchype, where escrow protects
            you.
          </p>
        </Card>
      </ul>
    </section>
  );
}

const MONEY_STEPS: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  text: string;
}[] = [
  {
    icon: Clock,
    tone: "peach",
    title: "You approve, then you pay",
    text: "After you approve a creator you have 48 hours to pay. If you don’t, the approval lapses and the place opens up again.",
  },
  {
    icon: Lock,
    tone: "mint",
    title: "Your money is held",
    text: "You pay the agreed price plus the service fee, and Pitchype holds the agreed price. The creator can’t start until it’s paid.",
  },
  {
    icon: Wallet,
    tone: "sun",
    title: "You review the work",
    text: "You have 7 days from each submission to accept it or decline it with your reasons. The creator can fix it and resubmit up to 3 times. If you don’t respond, it’s released to the creator automatically, and we remind you before then.",
  },
  {
    icon: Scale,
    tone: "rose",
    title: "If something goes wrong",
    text: "Either side can open a dispute after a decline. The money stays held while an admin reads both sides and decides. If a creator withdraws, you get a refund to your Pitchype wallet.",
  },
];

const examplePrice = formatNaira(EXAMPLE_PRICE_KOBO);
const minBudget = formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA);

type CampaignType = {
  id: string;
  icon: LucideIcon;
  tone: Tone;
  label: string;
  title: string;
  bestFor: string;
  fragment: ReactNode;
  steps: string[];
  facts: { term: string; value: string }[];
};

// Two kinds of campaign, one panel each, so a business can compare them side
// by side. Both are built (campaign form: "Fixed price" and "Per click on your
// link"); the numbers come from lib/campaign.ts and lib/fees.ts.
const CAMPAIGN_TYPES: CampaignType[] = [
  {
    id: "fixed-price",
    icon: ClipboardList,
    tone: "sky",
    label: "Fixed price",
    title: "Pay a set price for the content",
    bestFor:
      "Best when you want specific content: a set number of reels, posts, stories or videos from each creator.",
    fragment: (
      <ProductFragment
        label={`a fixed-price campaign paying ${examplePrice} per creator for 5 places, with two Instagram reels, an Instagram story and a TikTok video each`}
      >
        <p className="pr-14 font-semibold">Product launch</p>
        <p className="mt-1 text-xs text-muted">
          {examplePrice} per creator · 5 places
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip>2 Instagram reels</Chip>
          <Chip>1 Instagram story</Chip>
          <Chip>1 TikTok video</Chip>
        </div>
      </ProductFragment>
    ),
    steps: [
      "Write the brief: the deliverables (platform, type and quantity), a price per creator, how many creators you need and who can apply.",
      "Creators apply at your price, or propose their own. Chat to agree the details.",
      "Approve the creators you want and pay within 48 hours. The agreed price is held in escrow.",
      "Review the work. Accept it, or decline with reasons. No reply in 7 days pays the creator.",
    ],
    facts: [
      {
        term: "You set",
        value:
          "The price per creator, the deliverables, how many creators you need and the dates.",
      },
      {
        term: "You pay",
        value: `The agreed price plus a ${formatRate(BUSINESS_FEE_BPS)} service fee (at least ${formatNaira(MIN_FEE_KOBO)}).`,
      },
      {
        term: "Creators are paid",
        value:
          "When you accept the work, or 7 days after they submit if you don’t reply.",
      },
    ],
  },
  {
    id: "per-click",
    icon: Link2,
    tone: "lilac",
    label: "Pay per click",
    title: "Pay for the visits it brings",
    bestFor:
      "Best when the goal is visits, such as a sale page or a sign-up form, and you’d rather pay for visits than for posts.",
    fragment: (
      <ProductFragment label="a pay-per-click campaign at ₦100 a click with a ₦20,000 budget per creator, showing two creators' clicks and how much of each budget they have used">
        <p className="pr-14 font-semibold">Skincare sale</p>
        <p className="mt-1 text-xs text-muted">
          ₦100 per click · ₦20,000 per creator
        </p>
        <ul className="mt-3 space-y-2.5">
          {[
            {
              initials: "TA",
              colour: "lilac",
              name: "Tunde A.",
              spent: "140 clicks · ₦14,000",
              used: 70,
            },
            {
              initials: "AO",
              colour: "sun",
              name: "Amaka O.",
              spent: "62 clicks · ₦6,200",
              used: 31,
            },
          ].map((row) => (
            <li key={row.name} className="flex items-center gap-2">
              <Avatar
                initials={row.initials}
                colour={row.colour as "lilac" | "sun"}
              />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2 text-xs">
                  <span className="font-semibold">{row.name}</span>
                  <span className="text-muted">{row.spent}</span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-surface-card">
                  <span
                    className="block h-full rounded-full bg-ink"
                    style={{ width: `${row.used}%` }}
                  />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </ProductFragment>
    ),
    steps: [
      `Set a price per click (from ₦${MIN_CPC_NAIRA}), a budget for each creator (from ${minBudget}) and a secure link for visitors to land on. Our team reviews the campaign before it goes live.`,
      "Approve creators and fund each budget. Each creator gets one short tracked link to share.",
      "Clicks count until the deliver-by date. You see them per creator and per day.",
      "72 hours later each creator is paid for their billable clicks, and unspent budget returns to your wallet.",
    ],
    facts: [
      {
        term: "You set",
        value:
          "The price per click, the budget for each creator, the destination link and the deliver-by date.",
      },
      {
        term: "You pay",
        value:
          "Only for billable clicks, up to each creator’s budget. The service fee is charged on what you spend.",
      },
      {
        term: "Creators are paid",
        value:
          "For billable clicks, 72 hours after the click window closes. There is no review step.",
      },
    ],
  },
];

export function CampaignTypesSection() {
  return (
    <section
      id="campaign-types"
      aria-labelledby="campaign-types-title"
      className="container-page section-y"
    >
      <h2 id="campaign-types-title" className="text-display-lg">
        Two ways to run a campaign
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg">
        Choose how you pay when you write the brief. Both hold each creator’s
        money in escrow, and every creator applies to the same terms.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {CAMPAIGN_TYPES.map((type) => (
          <article
            key={type.id}
            id={type.id}
            aria-labelledby={`${type.id}-title`}
            className="flex flex-col rounded-panel p-5 panel sm:p-6"
          >
            <div className="flex items-center gap-3">
              <ClayTile icon={type.icon} tone={type.tone} size="lg" />
              <p className="text-sm font-semibold text-muted">{type.label}</p>
            </div>
            <h3 id={`${type.id}-title`} className="mt-4 text-display-md">
              {type.title}
            </h3>
            <p className="mt-2 text-[0.9375rem]">{type.bestFor}</p>
            <div className="mt-5">{type.fragment}</div>

            <h4 className="mt-6 text-sm font-semibold text-ink">
              How it works
            </h4>
            <ol className="mt-3 space-y-3">
              {type.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-[0.9375rem]">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-auto pt-6">
              <dl className="divide-y divide-hairline rounded-card bg-surface-soft px-5 py-2 text-[0.9375rem] ring-1 ring-hairline">
                {type.facts.map((fact) => (
                  <div
                    key={fact.term}
                    className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4"
                  >
                    <dt className="shrink-0 font-semibold text-ink sm:w-36">
                      {fact.term}
                    </dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-panel p-5 panel sm:p-6">
          <h3 className="text-display-md">What counts as a click</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[0.9375rem]">
            <li>
              A real visit to your destination through a creator’s link, before
              the deliver-by date.
            </li>
            <li>
              Link previews, automated visitors and clicks from channels you
              have blocked don’t count.
            </li>
            <li>
              One person counts once per link in any 24 hours. Each creator also
              has a cap, so their share can’t be spent past its budget.
            </li>
          </ul>
        </div>
        <div className="rounded-panel p-5 panel sm:p-6">
          <h3 className="text-display-md">What you can see</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[0.9375rem]">
            <li>
              Clicks per day, where they came from, and each creator’s clicks
              and spend.
            </li>
            <li>
              After settlement, a summary of what was spent, what returned to
              your wallet and our fees, with a CSV download.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function MoneySection() {
  return (
    <section
      id="money"
      aria-labelledby="money-title"
      className="container-page section-y"
    >
      <h2 id="money-title" className="text-display-lg">
        How your money is held
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg">
        You never pay a creator directly. Every job goes through the same four
        stages.
      </p>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MONEY_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col rounded-panel p-5 panel sm:p-6"
          >
            <div className="flex items-center justify-between">
              <ClayTile icon={step.icon} tone={step.tone} />
              <span
                aria-hidden="true"
                className="font-display text-sm text-muted tabular-nums"
              >
                0{index + 1}
              </span>
            </div>
            <h3 className="mt-4 text-display-md">{step.title}</h3>
            <p className="mt-2 text-[0.9375rem]">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-[40rem] text-sm text-body">
        Before you pay, we tell you that our service fee isn’t refunded if you
        cancel after paying, and you confirm you’ve seen it.
      </p>
    </section>
  );
}

export function CostSection() {
  return (
    <section
      id="cost"
      aria-labelledby="cost-title"
      className="container-page section-y"
    >
      <h2 id="cost-title" className="text-display-lg">
        What it costs
      </h2>
      <p className="mt-4 max-w-[38rem] text-lg">
        There’s no subscription and no fee to join. You pay a service fee on top
        of the agreed price, only on jobs you fund.
      </p>
      <div className="mt-10 grid items-center gap-6 md:grid-cols-2">
        <FeeReceipt receipt={BUSINESS_RECEIPT} />
        <ul className="space-y-3 text-[0.9375rem]">
          <li>
            The service fee is at least {formatNaira(MIN_FEE_KOBO)} per job, so
            very small jobs pay the minimum.
          </li>
          <li>
            On pay-per-click campaigns the service fee is charged on what you
            spend, not on the full budget.
          </li>
          <li>
            The creator’s own fee comes out of what they earn, not out of your
            payment.
          </li>
        </ul>
      </div>
    </section>
  );
}

export const BUSINESS_FAQ: FaqItem[] = [
  {
    question: "What does it cost?",
    answer: `Joining is free and there are no monthly fees. You pay a ${formatRate(BUSINESS_FEE_BPS)} service fee on top of the agreed price (at least ${formatNaira(MIN_FEE_KOBO)}), only on jobs you fund.`,
  },
  {
    question: "How does escrow work?",
    answer:
      "When you approve a creator you pay the agreed price plus the service fee. Pitchype holds the agreed price until you accept the work, or 7 days pass without a reply, then releases it to the creator.",
  },
  {
    question: "How long do I have to pay after approving someone?",
    answer:
      "48 hours. After that the approval lapses and the place opens up again, so you can hire someone else.",
  },
  {
    question: "Do I have to review the work?",
    answer:
      "You have 7 days from each submission to accept it or decline it with your reasons. If you don’t respond in that time, the money is released to the creator automatically. We send reminders before then.",
  },
  {
    question: "What if the creator doesn’t deliver?",
    answer:
      "If a creator withdraws, you get a refund to your Pitchype wallet. If they haven’t started yet, you can cancel the hire and get the agreed price back (our service fee isn’t refunded). If they started and then go quiet, you can open a dispute once the deliver-by date and 7 days after they started have both passed. The money stays held while an admin decides.",
  },
  {
    question: "Can I choose who is allowed to apply?",
    answer:
      "Yes. Set the platforms, niches and locations you want, a minimum follower range for each platform, and optionally only verified creators.",
  },
  {
    question: "Can I negotiate the price?",
    answer:
      "On fixed-price campaigns, creators can apply at your listed price or propose their own, and you can chat before you approve. You approve the price you saw. On pay-per-click campaigns you set the rate and the budget, and creators apply on those terms.",
  },
  {
    question: "How does pay per click work?",
    answer:
      "You set a price per click (from ₦50) and a budget for each creator (from ₦5,000). Each approved creator gets a tracked link. Clicks count until the deliver-by date, and 72 hours later each creator is paid for their billable clicks. Unspent budget returns to your wallet.",
  },
];
