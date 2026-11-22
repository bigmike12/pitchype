import {
  Clock,
  FileCheck2,
  Lock,
  Search,
  Send,
  UserRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, Chip, ProductFragment } from "@/components/brand/fragments";
import { ClayTile, type Tone } from "@/components/brand/stickers";
import type { FaqItem } from "@/components/landing/faq";
import { CREATOR_RECEIPT, FeeReceipt } from "@/components/landing/pricing";
import type { ComparisonRow } from "@/components/landing/why-pitchype";
import { MIN_PRICE_NAIRA } from "@/lib/campaign";
import {
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  MIN_PAYOUT_KOBO,
  formatRate,
} from "@/lib/fees";
import { KOBO_PER_NAIRA, formatNaira } from "@/lib/money";

// Everything on this page describes what is built today. Nothing about
// features that don't exist yet (docs/superpowers/specs/2026-11-18-audience-
// pages-design.md).

const minPrice = formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA);
const minPayout = formatNaira(MIN_PAYOUT_KOBO);

export const WHY_ROWS: ComparisonRow[] = [
  {
    topic: "Getting paid before you’re famous",
    usual:
      "Platform creator funds set follower and view targets first, and aren’t open in every country.",
    pitchype:
      "No follower minimum to join. Businesses pay for the work, not the follower count.",
  },
  {
    topic: "Finding work",
    usual: "Waiting for a message and hoping a brand notices you.",
    pitchype:
      "Browse open campaigns by niche and platform, see only the ones you qualify for, and get found in the creator directory.",
  },
  {
    topic: "Agreeing the price",
    usual:
      "Back and forth in DMs, and the price can move after you’ve started.",
    pitchype:
      "Apply at the listed price or propose your own. It’s locked once the job is paid for.",
  },
  {
    topic: "Getting paid",
    usual: "Post first and chase the money.",
    pitchype:
      "You start once the business has paid into escrow. You’re paid once the work is approved, or automatically if the business doesn’t respond within 7 days.",
  },
  {
    topic: "When the business says no",
    usual: "A vague “not quite” and nothing you can do about it.",
    pitchype:
      "A decline comes with written reasons. Fix it and resubmit, or open a dispute for an admin to decide.",
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

export function FindWorkSection() {
  return (
    <section
      id="find-work"
      aria-labelledby="find-work-title"
      className="container-page section-y"
    >
      <h2 id="find-work-title" className="text-display-lg">
        Find work and apply
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg">
        Get found in the directory, or go looking. Either way you see the terms
        before you commit to anything.
      </p>
      <ul className="grid gap-4 lg:grid-cols-3">
        <Card
          icon={UserRound}
          tone="lilac"
          title="Build your profile"
          fragment={
            <ProductFragment label="a creator profile for Zainab, a verified beauty creator on TikTok in Abuja">
              <div className="flex items-center gap-2 pr-14">
                <Avatar initials="ZB" colour="coral" />
                <p className="font-semibold">Zainab B.</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip>Beauty</Chip>
                <Chip>TikTok</Chip>
                <Chip>Abuja</Chip>
                <Chip className="border-ink bg-ink text-white">Verified</Chip>
              </div>
            </ProductFragment>
          }
        >
          <p>
            Add your platforms, niche, city, follower range and starting rate.
            Your profile stays a draft until you publish it, and you choose
            whether search engines can list it.
          </p>
          <p>
            To get a Verified badge, put a one-time Pitchype code in your bio.
            An admin checks it and records the follower count they saw.
          </p>
        </Card>

        <Card
          icon={Search}
          tone="mint"
          title="Find campaigns that fit"
          fragment={
            <ProductFragment label="a campaign that needs 10,000 or more Instagram followers, with a note that the creator isn't there yet">
              <p className="font-semibold">Skincare launch</p>
              <p className="mt-1 text-xs text-muted">
                Needs 10,000+ Instagram followers. Not a fit yet.
              </p>
            </ProductFragment>
          }
        >
          <p>
            Search open campaigns, filter by niche and platform, or switch to
            only the ones you qualify for. Open one to read the full brief and
            deliverables.
          </p>
          <p>
            If you don’t meet a requirement yet, we tell you which one instead
            of hiding the campaign.
          </p>
        </Card>

        <Card
          icon={Send}
          tone="sky"
          title="Apply or propose your price"
          fragment={
            <ProductFragment label="a proposal of ₦35,000 on a campaign listed at ₦40,000">
              <p className="text-xs text-muted">
                Listed at <span className="line-through">₦40,000</span>
              </p>
              <p className="font-semibold">Your price: ₦35,000</p>
            </ProductFragment>
          }
        >
          <p>
            Apply at the listed price, or propose your own (from {minPrice}). On
            pay-per-click campaigns you propose a price per click instead, since
            the budget is fixed. The business messages you first, and you reply
            in that thread.
          </p>
          <p>
            Phone numbers, email addresses and WhatsApp or Telegram links are
            blocked in chat, so the deal stays on Pitchype, where escrow
            protects you.
          </p>
        </Card>
      </ul>
    </section>
  );
}

const PAID_STEPS: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  text: string;
}[] = [
  {
    icon: Lock,
    tone: "mint",
    title: "You start once it’s funded",
    text: "The business pays before you begin, and the money is held in escrow. You press Start work to confirm you’re beginning.",
  },
  {
    icon: FileCheck2,
    tone: "sky",
    title: "You submit your proof",
    text: "Add links to your posts, screenshots, and a short note. You need at least one link or screenshot.",
  },
  {
    icon: Clock,
    tone: "peach",
    title: "Approved, or 7 days",
    text: "The business has 7 days to review. If they accept the work, or don’t respond within 7 days, the money is released to your wallet, less our fee. If they decline, you get their reasons and can resubmit up to 3 times.",
  },
  {
    icon: Wallet,
    tone: "sun",
    title: "You cash out",
    text: `Request a payout from your wallet to your bank account (from ${minPayout}). You see the transfer cost before you confirm, and each request is reviewed before it’s sent.`,
  },
];

export function GetPaidSection() {
  return (
    <section
      id="get-paid"
      aria-labelledby="get-paid-title"
      className="container-page section-y"
    >
      <h2 id="get-paid-title" className="text-display-lg">
        How you get paid
      </h2>
      <p className="mt-4 mb-10 max-w-[38rem] text-lg">
        You don’t send invoices or chase payments. Every job goes through the
        same four stages.
      </p>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PAID_STEPS.map((step, index) => (
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
        If you and a business can’t agree after a decline, either of you can
        open a dispute. The money stays held while an admin reads both sides and
        decides.
      </p>
      <p className="mt-3 max-w-[40rem] text-sm text-body">
        Pay-per-click campaigns have no review step. Your tracked link counts
        the clicks, and 72 hours after the deliver-by date you’re paid for the
        billable ones, up to the budget.
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
        Joining is free and there’s no subscription. We take a small fee from
        what you earn, only when you’re paid.
      </p>
      <div className="mt-10 grid items-center gap-6 md:grid-cols-2">
        <FeeReceipt receipt={CREATOR_RECEIPT} />
        <ul className="space-y-3 text-[0.9375rem]">
          <li>
            Our fee is at least {formatNaira(MIN_FEE_KOBO)} per job, so very
            small jobs pay the minimum.
          </li>
          <li>
            The business’s own fee is on top of your price. It doesn’t come out
            of what you earn.
          </li>
          <li>
            When you cash out, the bank transfer fee is passed on at cost, and
            you see it before you confirm.
          </li>
        </ul>
      </div>
    </section>
  );
}

export const CREATOR_FAQ: FaqItem[] = [
  {
    question: "Do I need a lot of followers to join?",
    answer:
      "No. There’s no follower minimum to join Pitchype. Businesses can set their own requirements on each campaign, and you’ll see why if one isn’t a fit for you yet.",
  },
  {
    question: "What does it cost?",
    answer: `Joining is free and there are no monthly fees. We take ${formatRate(INFLUENCER_FEE_BPS)} of what you earn (at least ${formatNaira(MIN_FEE_KOBO)} per job) when you’re paid, and the bank transfer fee is passed on at cost when you cash out.`,
  },
  {
    question: "When do I get paid?",
    answer:
      "As soon as the business approves your work, the money moves to your Pitchype wallet, less our fee. From there you can request a payout to your bank account.",
  },
  {
    question: "What if the business doesn’t respond?",
    answer:
      "Businesses have 7 days to accept or decline submitted work. If they don’t respond in that time, the money is released to you automatically.",
  },
  {
    question: "What if the business declines my work?",
    answer:
      "They have to give you their reasons. You can fix the work and resubmit up to 3 times, or either of you can open a dispute and an admin decides. The money stays held until then.",
  },
  {
    question: "Can I negotiate a price?",
    answer:
      "Yes. On fixed-price campaigns you can apply at the listed price or propose your own. On pay-per-click campaigns you can propose your own price per click; the budget stays the business's, so a higher rate means fewer clicks to earn it. The business sees every rate before it hires, and you can chat to agree the details before any money moves.",
  },
  {
    question: "How are pay-per-click campaigns paid?",
    answer:
      "When you start work you get a tracked link. Clicks count until the deliver-by date, and 72 hours later you’re paid for the billable clicks, up to your budget. The same fee applies as on any job. If you withdraw after starting, the clicks stop and you’re paid for the clicks so far.",
  },
  {
    question: "How do I get verified?",
    answer:
      "Put a one-time Pitchype code in your bio on that platform. An admin checks it and records the follower count they saw. Verified creators show a Verified badge and can apply to campaigns that are limited to verified creators.",
  },
  {
    question: "Why can’t I share my phone number in chat?",
    answer:
      "Chat blocks phone numbers, email addresses and WhatsApp or Telegram links. Keeping the deal on Pitchype keeps escrow and dispute help in place for you.",
  },
];
