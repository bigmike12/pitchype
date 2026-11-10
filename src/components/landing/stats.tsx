import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Outside figures on the landing page. Every number here has a public source,
// linked on its card, and was checked on 2026-11-10. They are global or US
// figures (there are no Nigerian benchmarks yet); say so where they're shown,
// and replace them with Pitchype's own data once there is some. Never add a
// figure without a source (CLAUDE.md §3: no unverified statistics).

export type Stat = {
  value: string;
  text: string;
  source: { name: string; url: string };
};

const TIKTOK_CREATOR_REWARDS = {
  name: "TikTok Creator Academy",
  url: "https://www.tiktok.com/creator-academy/article/creator-rewards-program",
};

export const CREATOR_STATS: Stat[] = [
  {
    value: "10,000",
    text: "followers, plus 100,000 views in the last 30 days, before TikTok’s Creator Rewards pays you anything.",
    source: TIKTOK_CREATOR_REWARDS,
  },
  {
    value: "8",
    text: "countries where TikTok’s Creator Rewards is open. Nigeria isn’t one of them.",
    source: TIKTOK_CREATOR_REWARDS,
  },
  {
    value: "41%",
    text: "of creators say late payment is their biggest problem when working with brands.",
    source: {
      name: "Influencer and Crowd DNA, 2025, via EMARKETER",
      url: "https://www.emarketer.com/content/marketers-face-challenges-compensating-creators",
    },
  },
  {
    value: "59%",
    text: "of creator income is forecast to come from sponsored content in 2026, against 24% from platform payouts.",
    source: {
      name: "EMARKETER forecast",
      url: "https://www.emarketer.com/insights/definition-creator-economy",
    },
  },
];

const STATUSPHERE = {
  name: "Statusphere, State of Micro-Influencer Marketing 2025",
  url: "https://brands.joinstatus.com/micro-influencer-report-2025",
};

export const BUSINESS_STATS: Stat[] = [
  {
    value: "30",
    text: "micro-creators per campaign, on average, in a 2025 benchmark of brand campaigns.",
    source: STATUSPHERE,
  },
  {
    value: "81%",
    text: "of brands rated micro-creators’ content as meeting or beating their expectations.",
    source: STATUSPHERE,
  },
  {
    value: "43.9%",
    text: "of marketers say finding the right creators is their biggest challenge.",
    source: {
      name: "EMARKETER and Spotter, 2025",
      url: "https://www.emarketer.com/content/marketers-struggle-find-compatible-creators-despite-rising-budgets--new-research-finds",
    },
  },
  {
    value: "48%",
    text: "of US ad buyers now see creators as a “must buy”, behind only social media and paid search.",
    source: {
      name: "IAB, Creator Economy Ad Spend & Strategy Report 2025",
      url: "https://www.iab.com/news/creator-economy-ad-spend-to-reach-37-billion-in-2025-growing-4x-faster-than-total-media-industry-according-to-iab/",
    },
  },
];

/** Four figures in a row (two on phones), each with its source. */
export function StatGrid({
  stats,
  label,
  className,
}: {
  stats: Stat[];
  label: string;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {stats.map((stat) => (
        <li
          key={stat.value + stat.text}
          className="flex flex-col rounded-card p-5 panel reveal"
        >
          <p className="font-display text-[2.5rem] leading-none tracking-[-0.04em] text-ink tabular-nums">
            {stat.value}
          </p>
          <p className="mt-3 text-[0.9375rem]">{stat.text}</p>
          <a
            href={stat.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-start gap-1 pt-4 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            <span>
              Source: {stat.source.name}
              <span className="sr-only"> (opens in a new tab)</span>
            </span>
            <ArrowUpRight
              className="mt-px size-3 shrink-0"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
