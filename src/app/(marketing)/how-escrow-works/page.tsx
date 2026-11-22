import type { Metadata } from "next";
import { Clock, FileCheck2, Lock, Send, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ClayTile, type Tone } from "@/components/brand/stickers";
import { AudienceCta } from "@/components/landing/audience-cta";
import { AudienceHero } from "@/components/landing/audience-hero";
import { Faq, type FaqItem } from "@/components/landing/faq";
import {
  BUSINESS_RECEIPT,
  CREATOR_RECEIPT,
  FEE_NOTES,
  FeeReceipt,
} from "@/components/landing/pricing";
import { MIN_PAYOUT_KOBO } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

// Plain-language summary of the rules in CLAUDE.md §6 as the product works
// today. It states no legal promises; the Terms carry the full wording.

export const metadata: Metadata = {
  title: "How escrow works",
  description:
    "How Pitchype holds a business’s payment until the work is approved, what our fees are, and what happens when a job is cancelled or disputed.",
  alternates: { canonical: "/how-escrow-works" },
};

const STEPS: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  text: string;
}[] = [
  {
    icon: Clock,
    tone: "peach",
    title: "Approve, then pay",
    text: "A business approves a creator. It then has 48 hours to pay the agreed price plus the service fee. If it doesn’t, the approval lapses and the place opens up again.",
  },
  {
    icon: Lock,
    tone: "mint",
    title: "The price is held",
    text: "The agreed price is held for that one hire. Wallet balance is used first, then the card. The creator can’t start until the payment is in.",
  },
  {
    icon: FileCheck2,
    tone: "sky",
    title: "Work, then proof",
    text: "The creator presses Start work, then submits links, screenshots and a note. From Start work on, the creator can’t cancel on their own.",
  },
  {
    icon: Send,
    tone: "sun",
    title: "Released on approval",
    text: "The business accepts the work and the creator is paid. If it declines, it gives reasons, and the creator can resubmit up to 3 times. If the business doesn’t reply within 7 days of a submission, the money is released automatically.",
  },
];

const OUTCOMES: { situation: string; result: string }[] = [
  {
    situation: "The business cancels before the creator starts",
    result:
      "The agreed price goes back to the business’s Pitchype wallet. The service fee isn’t refunded.",
  },
  {
    situation: "The business wants to cancel after the creator starts",
    result:
      "It can’t cancel alone. The creator has to agree, or either side can open a dispute.",
  },
  {
    situation: "The creator withdraws, or an admin finds the creator at fault",
    result:
      "The business gets the agreed price and the service fee back, less the card charge on its payment, to its Pitchype wallet.",
  },
  {
    situation: "Either side opens a dispute",
    result:
      "The money stays held. An admin reads both sides and decides: release to the creator in full, refund to the business in full, or a split by amount. The decision comes with a written reason.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Who holds the money?",
    answer:
      "The business’s card payment goes to our payment provider, Paystack. Our records show the agreed price as held for that hire until one of the rules on this page releases it.",
  },
  {
    question: "How do I get money back to my card?",
    answer:
      "Refunds go to your Pitchype wallet. An admin can refund to your original payment method by hand if you ask, which takes several days.",
  },
  {
    question: "Why isn’t the service fee refunded?",
    answer:
      "Our payment provider keeps its charge when a payment is refunded, and our service fee is set higher than that charge. You’re told this before you pay, and again when you cancel.",
  },
  {
    question: "When does a creator get paid for a pay-per-click campaign?",
    answer:
      "Clicks count until the campaign’s deliver-by date. 72 hours later each creator is paid for the billable clicks, up to their budget, and the rest of the budget returns to the business’s wallet.",
  },
  {
    question: "How does a creator cash out?",
    answer: `A creator requests a payout from their wallet to their bank account, from ${formatNaira(MIN_PAYOUT_KOBO)}. Our team approves each payout before the transfer is sent, and the transfer cost is shown before the creator confirms.`,
  },
];

export default function HowEscrowWorksPage() {
  return (
    <main id="main">
      <AudienceHero
        eyebrow="How escrow works"
        title={
          <>
            Your payment is held until{" "}
            <span className="text-gradient">the work is approved.</span>
          </>
        }
        lead="When a business hires a creator, the agreed price is held for that hire. It’s released only when the business accepts the work, when 7 days pass without a reply, or when an admin decides a dispute."
        primaryCta={{ href: "/signup", label: "Create an account" }}
        note="A plain-language summary. The full terms apply."
      />

      <section
        id="steps"
        aria-labelledby="steps-title"
        className="container-page section-y"
      >
        <h2 id="steps-title" className="text-display-lg">
          From approval to payout
        </h2>
        <p className="mt-4 mb-10 max-w-[38rem] text-lg">
          Every hire goes through the same four steps. Creators then cash out
          from their wallet.
        </p>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
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
        <p className="mt-6 flex max-w-[40rem] items-start gap-3 text-[0.9375rem]">
          <Wallet className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>
            Creators cash out from their wallet to their bank account, from{" "}
            {formatNaira(MIN_PAYOUT_KOBO)}. Each payout is approved by our team
            before the transfer is sent.
          </span>
        </p>
      </section>

      <section
        id="fees"
        aria-labelledby="fees-title"
        className="container-page section-y"
      >
        <h2 id="fees-title" className="text-display-lg">
          What it costs
        </h2>
        <p className="mt-4 mb-10 max-w-[38rem] text-lg">
          The business pays a service fee on top of the agreed price. The
          creator pays a fee out of what they earn. Here is a job at the example
          price, from both sides.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FeeReceipt receipt={BUSINESS_RECEIPT} />
          <FeeReceipt receipt={CREATOR_RECEIPT} />
        </div>
        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {FEE_NOTES.map((note) => (
            <li key={note} className="text-[0.9375rem]">
              {note}
            </li>
          ))}
        </ul>
      </section>

      <section
        id="outcomes"
        aria-labelledby="outcomes-title"
        className="container-page section-y"
      >
        <h2 id="outcomes-title" className="text-display-lg">
          When a job doesn’t go to plan
        </h2>
        <p className="mt-4 mb-10 max-w-[38rem] text-lg">
          Cancellations, withdrawals and disputes each have a fixed outcome. No
          one can change the money on their own.
        </p>
        <dl className="divide-y divide-hairline overflow-hidden rounded-frame panel">
          {OUTCOMES.map((row) => (
            <div
              key={row.situation}
              className="grid gap-2 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-8 md:p-6"
            >
              <dt className="font-semibold text-ink">{row.situation}</dt>
              <dd className="text-[0.9375rem] text-body">{row.result}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id="pay-per-click"
        aria-labelledby="pay-per-click-title"
        className="container-page section-y"
      >
        <h2 id="pay-per-click-title" className="text-display-lg">
          Pay-per-click campaigns
        </h2>
        <p className="mt-4 max-w-[40rem] text-lg">
          On a pay-per-click campaign, each creator’s budget is escrowed when
          the business approves and pays for them, the same as a fixed-price
          hire. Clicks count until the deliver-by date. Then, 72 hours later,
          each hire settles once: the creator is paid for the billable clicks,
          and unspent budget returns to the business’s wallet.
        </p>
      </section>

      <Faq items={FAQ_ITEMS} title="Questions about escrow" />

      <AudienceCta
        title={
          <>
            Ready to <span className="text-gradient">start?</span>
          </>
        }
        text="Create a free account. Businesses see the fee before they pay, and creators see the price before they apply."
        cta={{ href: "/signup", label: "Create an account" }}
      />
    </main>
  );
}
