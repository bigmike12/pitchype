// The business's view of a per-click campaign's clicks: totals, clicks per
// day, where they came from, and each creator's progress. Counts are as of
// page load. Each creator is a stacked row on a phone and a table row from
// 768px.

import { Download, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { lagosToday, maxClicks } from "@/lib/campaign";
import { fillDays } from "@/lib/click-chart";
import { blockedShareWarning } from "@/lib/click-words";
import type { CampaignClicks as Clicks } from "@/lib/db/clicks";
import { formatNaira } from "@/lib/money";

import { ClickDayChart } from "./click-day-chart";
import { ClickSources } from "./click-sources";

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

export function CampaignClicks({
  clicks,
  campaignId,
  deliverBy,
}: {
  clicks: Clicks;
  campaignId: string;
  deliverBy: string;
}) {
  const budgetKobo = clicks.hires.reduce((sum, h) => sum + h.capKobo, 0);
  const today = lagosToday();
  const chartDays =
    clicks.days.length > 0
      ? fillDays(
          clicks.days,
          clicks.days[0].day,
          deliverBy < today ? deliverBy : today,
        )
      : [];
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Clicks counted"
          value={clicks.billable.toLocaleString("en-NG")}
        />
        <Stat
          label="Visits not counted"
          value={(clicks.totalHits - clicks.billable).toLocaleString("en-NG")}
        />
        <Stat label="Spent so far" value={formatNaira(clicks.spentKobo)} />
        <Stat
          label="Budget left"
          value={formatNaira(Math.max(budgetKobo - clicks.spentKobo, 0))}
        />
      </dl>

      {(chartDays.length > 0 || Object.keys(clicks.sources).length > 0) && (
        <div className="grid gap-5">
          <div className="min-w-0">
            <ClickDayChart days={chartDays} />
          </div>
          <ClickSources sources={clicks.sources} />
        </div>
      )}

      <div>
        <div className="hidden grid-cols-[minmax(0,1.6fr)_1fr_1fr_0.7fr] gap-4 border-b border-hairline pb-2 text-sm text-muted md:grid">
          <span>Creator</span>
          <span>Clicks</span>
          <span>Spent</span>
          <span>Posts added</span>
        </div>
        <ul className="divide-y divide-hairline">
          {clicks.hires.map((h) => {
            const cap = maxClicks(h.capKobo, h.cpcKobo);
            const pct =
              cap > 0 ? Math.min(100, Math.floor((h.billable / cap) * 100)) : 0;
            return (
              <li
                key={h.engagementId}
                className="grid gap-2 py-3 md:grid-cols-[minmax(0,1.6fr)_1fr_1fr_0.7fr] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/business/engagements/${h.engagementId}`}
                    className="link font-semibold break-words"
                  >
                    {h.creatorName}
                  </Link>
                  {h.blockedShares.map((channel) => (
                    <p
                      key={channel}
                      className="mt-1 flex items-start gap-2 text-sm font-medium text-ink"
                    >
                      <TriangleAlert
                        className="mt-0.5 size-4 shrink-0 text-danger"
                        aria-hidden="true"
                      />
                      {blockedShareWarning(channel)}
                    </p>
                  ))}
                </div>
                <div className="text-sm text-ink tabular-nums">
                  <span className="text-muted md:hidden">Clicks: </span>
                  {h.billable.toLocaleString("en-NG")} of{" "}
                  {cap.toLocaleString("en-NG")}
                  <div
                    aria-hidden="true"
                    className="mt-1 h-1.5 rounded-full bg-surface-soft"
                  >
                    <div
                      className="h-1.5 rounded-full bg-brand-violet"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm text-ink tabular-nums">
                  <span className="text-muted md:hidden">Spent: </span>
                  {formatNaira(h.earnedKobo)}
                </div>
                <div className="text-sm text-ink">
                  <span className="text-muted md:hidden">Posts added: </span>
                  {h.proofCount > 0 ? h.proofCount : "None yet"}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">As of when you opened this page.</p>
        <a
          href={`/business/campaigns/${campaignId}/clicks.csv`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Download className="size-4" aria-hidden="true" />
          Download CSV
        </a>
      </div>
    </div>
  );
}
