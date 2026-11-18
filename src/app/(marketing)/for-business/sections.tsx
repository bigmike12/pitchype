import {
  ClipboardList,
  Clock,
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
import { BUSINESS_FEE_BPS, MIN_FEE_KOBO, formatRate } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

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
      "Your payment is held in escrow before the creator starts. Nothing is released until you approve the work or the 7-day review window ends.",
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
    <li className="flex flex-col rounded-panel p-5 panel reveal sm:p-6">
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
      <h2 id="hiring-title" className="text-display-lg reveal">
        Find, brief and hire creators
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg reveal">
        Start from a campaign creators apply to, or go straight to the people
        you like the look of. Either way you end up with one hire, one agreed
        price and one place to follow it.
      </p>
      <ul className="grid gap-4 lg:grid-cols-3">
        <Card
          icon={Search}
          tone="mint"
          title="Browse the directory"
          fragment={
            <ProductFragment label="creator filters for fashion, Lagos, TikTok and Instagram">
              <p className="font-semibold">Filters</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip className="border-ink bg-ink text-white">Fashion</Chip>
                <Chip className="border-ink bg-ink text-white">Lagos</Chip>
                <Chip>TikTok</Chip>
                <Chip>Verified</Chip>
              </div>
            </ProductFragment>
          }
        >
          <p>
            Filter by niche, platform, state, follower range and rate, then open
            a creator’s profile.
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
            (platform, type and quantity) and who can apply.
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
            Phone numbers and links to other apps are blocked in chat, so deals
            stay on Pitchype, where escrow protects you.
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
    title: "You decide when it’s released",
    text: "You have 7 days to accept the work or decline it with your reasons, and the creator can fix it and resubmit up to 3 times. If you don’t respond, it’s released to the creator, and we remind you before then.",
  },
  {
    icon: Scale,
    tone: "rose",
    title: "If something goes wrong",
    text: "Either side can open a dispute after a decline. The money stays held while an admin reads both sides and decides. If a creator withdraws, you get a refund to your Pitchype wallet.",
  },
];

export function MoneySection() {
  return (
    <section
      id="money"
      aria-labelledby="money-title"
      className="container-page section-y"
    >
      <h2 id="money-title" className="text-display-lg reveal">
        How your money is held
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg reveal">
        You never pay a creator directly. Every job goes through the same four
        stages.
      </p>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MONEY_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col rounded-panel p-5 panel reveal sm:p-6"
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
      <p className="mt-6 max-w-[40rem] text-sm text-muted">
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
      <h2 id="cost-title" className="text-display-lg reveal">
        What it costs
      </h2>
      <p className="mt-4 max-w-[38rem] text-lg reveal">
        There’s no subscription and no fee to join. You pay a service fee on top
        of the agreed price, only on jobs you fund.
      </p>
      <div className="mt-10 grid items-center gap-6 md:grid-cols-2">
        <FeeReceipt receipt={BUSINESS_RECEIPT} />
        <ul className="space-y-3 text-[0.9375rem] reveal">
          <li>
            The service fee is at least {formatNaira(MIN_FEE_KOBO)} per job, so
            very small jobs pay the minimum.
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
      "When you approve a creator you pay the agreed price plus the service fee. Pitchype holds the agreed price until you accept the work, then releases it to the creator.",
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
      "Yes. Creators can apply at your listed price or propose their own, and you can chat before you approve. You approve the price you saw.",
  },
];
