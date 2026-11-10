"use client";

import { useId, useState } from "react";

import { MIN_PRICE_NAIRA } from "@/lib/campaign";
import {
  BUSINESS_FEE_BPS,
  feeExample,
  formatRate,
  pricePerCreatorWithin,
} from "@/lib/fees";
import { KOBO_PER_NAIRA, formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

import { Slider } from "./slider";

// An illustration for businesses: the same budget on one big creator, or
// spread across several. Equal-budget arithmetic only; the copy says it is
// not a forecast of results.

const BUDGET_MIN = 100_000;
const BUDGET_MAX = 5_000_000;
const BUDGET_STEP = 50_000;
const MAX_CREATORS = 30;

const DOT_TONES = [
  "bg-brand-lilac",
  "bg-brand-peach",
  "bg-brand-mint",
  "bg-brand-sky",
  "bg-brand-rose",
  "bg-brand-sun",
];

export function BudgetSplitter() {
  const id = useId();
  const [budgetNaira, setBudgetNaira] = useState(1_000_000);
  const [creators, setCreators] = useState(20);

  const budgetKobo = budgetNaira * KOBO_PER_NAIRA;
  const price = pricePerCreatorWithin(budgetKobo, creators);
  const tooSmall = price < MIN_PRICE_NAIRA * KOBO_PER_NAIRA;
  const job = price > 0 ? feeExample(price) : null;

  return (
    <div className="rounded-frame bg-white/90 p-5 shadow-pop ring-1 ring-ink/[0.06] sm:p-7">
      <h3 className="text-display-md">Split your budget</h3>
      <p className="mt-1 text-sm text-muted">
        One creator, or several? Example only, not a forecast.
      </p>

      <div className="mt-6 space-y-6">
        <Slider
          id={`${id}-budget`}
          label="Your budget"
          value={formatNaira(budgetKobo)}
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          current={budgetNaira}
          onChange={setBudgetNaira}
        />
        <Slider
          id={`${id}-creators`}
          label="Creators"
          value={String(creators)}
          min={1}
          max={MAX_CREATORS}
          step={1}
          current={creators}
          onChange={setCreators}
        />
      </div>

      {/* One dot per creator: a picture of the spread. */}
      <div
        aria-hidden="true"
        className="mt-6 flex min-h-16 flex-wrap content-start gap-1.5 rounded-card bg-surface-soft p-3 ring-1 ring-hairline"
      >
        {Array.from({ length: creators }, (_, index) => (
          <span
            key={index}
            className={cn(
              "size-6 rounded-full ring-2 ring-white motion-safe:animate-[fade-up_0.35s_var(--ease-out-expo)_both]",
              DOT_TONES[index % DOT_TONES.length],
            )}
          />
        ))}
      </div>

      <div aria-live="polite" className="mt-4">
        {tooSmall || !job ? (
          <p className="rounded-card bg-[#fff1bf] p-4 text-[0.9375rem] text-ink ring-1 ring-[#f3dc8c]">
            That’s under the {formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA)}{" "}
            minimum per creator. Try fewer creators or a bigger budget.
          </p>
        ) : (
          <dl className="divide-y divide-hairline rounded-card bg-surface-soft text-[0.9375rem] ring-1 ring-hairline">
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt>Price per creator</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(job.agreedPriceKobo)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt>You pay, with the {formatRate(BUSINESS_FEE_BPS)} fee</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(job.businessPaysKobo * creators)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-4">
              <dt className="font-semibold text-ink">
                Creators posting for you
              </dt>
              <dd className="font-display text-3xl tracking-[-0.03em] text-ink tabular-nums">
                {creators}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        Equal budgets, not equal results: what works depends on picking the
        right creators, their audiences and your brief. Paying several lets you
        find out who actually moves your customers.
      </p>
    </div>
  );
}
