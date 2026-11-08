import { Check } from "lucide-react";

import {
  BUSINESS_FEE_BPS,
  EXAMPLE_PRICE_KOBO,
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  feeExample,
  formatRate,
} from "@/lib/fees";
import { formatNaira } from "@/lib/money";

// Every figure here comes from src/lib/fees.ts, so the page can't drift from
// the decided fees (CLAUDE.md §6.1).
const job = feeExample(EXAMPLE_PRICE_KOBO);

type Receipt = {
  title: string;
  rate: string;
  rateNote: string;
  lines: { label: string; amount: string }[];
  totalLabel: string;
  total: string;
};

const RECEIPTS: Receipt[] = [
  {
    title: "Businesses",
    rate: formatRate(BUSINESS_FEE_BPS),
    rateNote: "service fee, on top of the agreed price",
    lines: [
      { label: "Agreed price", amount: formatNaira(job.agreedPriceKobo) },
      {
        label: `Service fee (${formatRate(BUSINESS_FEE_BPS)})`,
        amount: `+${formatNaira(job.businessFeeKobo)}`,
      },
    ],
    totalLabel: "You pay",
    total: formatNaira(job.businessPaysKobo),
  },
  {
    title: "Creators",
    rate: formatRate(INFLUENCER_FEE_BPS),
    rateNote: "of what you earn",
    lines: [
      { label: "Agreed price", amount: formatNaira(job.agreedPriceKobo) },
      {
        label: `Pitchype fee (${formatRate(INFLUENCER_FEE_BPS)})`,
        amount: `−${formatNaira(job.influencerFeeKobo)}`,
      },
    ],
    totalLabel: "You receive",
    total: formatNaira(job.influencerReceivesKobo),
  },
];

const NOTES = [
  "No monthly fees. No fee to join.",
  `Fees are at least ${formatNaira(MIN_FEE_KOBO)} per job on each side, so very small jobs pay the minimum.`,
  "Cashing out to your bank? The bank transfer fee is passed on at cost, and you see it before you confirm.",
];

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="mx-auto max-w-7xl px-4 section-y sm:px-6 lg:px-8"
    >
      <h2 id="pricing-title" className="text-display-lg">
        Simple, honest fees
      </h2>
      <p className="mt-4 max-w-[36rem] text-lg">
        You only pay when real work happens. Here’s a{" "}
        {formatNaira(job.agreedPriceKobo)} job, from both sides.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {RECEIPTS.map((receipt) => (
          <article
            key={receipt.title}
            aria-labelledby={`pricing-${receipt.title}`}
            className="rounded-3xl bg-surface-card p-6 sm:p-8"
          >
            <h3
              id={`pricing-${receipt.title}`}
              className="text-lg font-semibold"
            >
              {receipt.title}
            </h3>
            <p className="mt-3 text-ink">
              <span className="block text-display-xl">{receipt.rate}</span>
              <span className="mt-1 block text-lg">{receipt.rateNote}</span>
            </p>

            <dl className="mt-8 rounded-2xl bg-canvas p-5 text-ink">
              {receipt.lines.map((line) => (
                <div
                  key={line.label}
                  className="flex justify-between gap-4 py-1.5"
                >
                  <dt>{line.label}</dt>
                  <dd className="tabular-nums">{line.amount}</dd>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-dashed border-field pt-3">
                <dt className="font-semibold">{receipt.totalLabel}</dt>
                <dd className="font-display text-2xl tabular-nums">
                  {receipt.total}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <ul className="mt-8 grid gap-4 lg:grid-cols-3">
        {NOTES.map((note) => (
          <li key={note} className="flex gap-3 text-[0.9375rem]">
            <Check
              className="mt-0.5 size-5 shrink-0 text-brand-green"
              aria-hidden="true"
            />
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
