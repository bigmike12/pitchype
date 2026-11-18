// How a per-click campaign went, once every paid hire has settled: what the
// clicks came to, what went back to the business, and what we kept. Every
// figure comes from the settlement itself (campaign_click_results).

import Link from "next/link";

import type { ClickResults as Results } from "@/lib/db/clicks";
import { formatNaira } from "@/lib/money";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface-soft p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function ClickResults({ results }: { results: Results }) {
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Clicks counted"
          value={results.billable.toLocaleString("en-NG")}
        />
        <Stat label="Spent on clicks" value={formatNaira(results.spentKobo)} />
        <Stat
          label="Back to your wallet"
          value={formatNaira(results.backKobo)}
        />
        <Stat label="Our fees" value={formatNaira(results.feeKeptKobo)} />
      </dl>
      <ul className="divide-y divide-hairline">
        {results.hires.map((h) => (
          <li
            key={h.engagementId}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm"
          >
            <Link
              href={`/business/engagements/${h.engagementId}`}
              className="link font-semibold"
            >
              {h.creatorName}
            </Link>
            <span className="text-ink tabular-nums">
              {h.billable.toLocaleString("en-NG")}{" "}
              {h.billable === 1 ? "click" : "clicks"} ·{" "}
              {formatNaira(h.releasedKobo)} spent · {formatNaira(h.backKobo)}{" "}
              back
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
