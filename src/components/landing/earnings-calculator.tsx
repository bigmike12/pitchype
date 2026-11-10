"use client";

import { useId, useState } from "react";

import { INFLUENCER_FEE_BPS, feeExample, formatRate } from "@/lib/fees";
import { KOBO_PER_NAIRA, formatNaira } from "@/lib/money";

import { Slider } from "./slider";

// An illustration for creators: what a few paid collaborations a month add up
// to after Pitchype's fee. Uses the same display fee maths as the pricing
// section (lib/fees.ts). Not a promise of work; the copy says so.

const RATE_MIN = 5_000;
const RATE_MAX = 300_000;
const RATE_STEP = 5_000;

export function EarningsCalculator() {
  const id = useId();
  const [rateNaira, setRateNaira] = useState(50_000);
  const [jobs, setJobs] = useState(3);

  const perJob = feeExample(rateNaira * KOBO_PER_NAIRA);
  const agreed = perJob.agreedPriceKobo * jobs;
  const fee = perJob.influencerFeeKobo * jobs;
  const receive = perJob.influencerReceivesKobo * jobs;

  return (
    <div className="rounded-frame bg-white/90 p-5 shadow-pop ring-1 ring-ink/[0.06] sm:p-7">
      <h3 className="text-display-md">What could you earn?</h3>
      <p className="mt-1 text-sm text-muted">
        Move the sliders. Example only, not a promise of work.
      </p>

      <div className="mt-6 space-y-6">
        <Slider
          id={`${id}-rate`}
          label="Your rate per collaboration"
          value={formatNaira(rateNaira * KOBO_PER_NAIRA)}
          min={RATE_MIN}
          max={RATE_MAX}
          step={RATE_STEP}
          current={rateNaira}
          onChange={setRateNaira}
        />
        <Slider
          id={`${id}-jobs`}
          label="Collaborations a month"
          value={String(jobs)}
          min={1}
          max={10}
          step={1}
          current={jobs}
          onChange={setJobs}
        />
      </div>

      <dl
        aria-live="polite"
        className="mt-7 divide-y divide-hairline rounded-card bg-surface-soft text-[0.9375rem] ring-1 ring-hairline"
      >
        <Row
          term="TikTok Creator Rewards (not open in Nigeria)"
          value={formatNaira(0)}
          muted
        />
        <Row term="Agreed with businesses" value={formatNaira(agreed)} />
        <Row
          term={`Pitchype fee (${formatRate(INFLUENCER_FEE_BPS)})`}
          value={`−${formatNaira(fee)}`}
        />
        <div className="flex items-baseline justify-between gap-4 px-4 py-4">
          <dt className="font-semibold text-ink">You receive a month</dt>
          <dd className="font-display text-3xl tracking-[-0.03em] text-ink tabular-nums">
            {formatNaira(receive)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        Before tax and the bank transfer fee when you withdraw. Work depends on
        businesses posting campaigns and choosing you.
      </p>
    </div>
  );
}

function Row({
  term,
  value,
  muted = false,
}: {
  term: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className={muted ? "text-muted" : "text-body"}>{term}</dt>
      <dd
        className={
          muted
            ? "text-muted tabular-nums"
            : "font-semibold text-ink tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
