// A per-click hire's counts, for the creator's job page and the business's
// hire page. Counts are as of page load (no live updates).

import { Ban, TriangleAlert } from "lucide-react";

import { CHANNEL_LABELS, maxClicks, type Channel } from "@/lib/campaign";
import {
  blockedShareWarning,
  FILTER_REASONS,
  filterReasonText,
} from "@/lib/click-words";
import type { LinkStats } from "@/lib/db/clicks";
import { formatNaira } from "@/lib/money";
import { SITE_URL } from "@/lib/site";

import { CopyLink } from "./copy-link";

export function ClickSummary({
  stats,
  viewer,
}: {
  stats: LinkStats;
  viewer: "creator" | "business";
}) {
  const cap = maxClicks(stats.capKobo, stats.cpcKobo);
  if (stats.code === null) {
    return (
      <div className="space-y-2">
        <p className="text-ink">
          {viewer === "creator"
            ? "Your link appears when you start."
            : "The creator’s link appears when they start."}{" "}
          {formatNaira(stats.cpcKobo)} per click, up to{" "}
          {cap.toLocaleString("en-NG")} clicks ({formatNaira(stats.capKobo)}).
        </p>
        <SharingRules blocked={stats.blockedChannels} />
      </div>
    );
  }

  const notCounted = FILTER_REASONS.filter((r) => (stats.filtered[r] ?? 0) > 0);
  const filteredTotal = stats.totalHits - stats.billable;
  return (
    <div className="space-y-4">
      {viewer === "creator" && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Your link</p>
          <CopyLink url={`${SITE_URL}/r/${stats.code}`} />
          <div className="mt-2">
            <SharingRules blocked={stats.blockedChannels} />
          </div>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted">Clicks counted</dt>
          <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">
            {stats.billable.toLocaleString("en-NG")}
            <span className="text-sm font-normal text-muted">
              {" "}
              of {cap.toLocaleString("en-NG")}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">
            {viewer === "creator" ? "Earned so far" : "Spent so far"}
          </dt>
          <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">
            {formatNaira(stats.earnedKobo)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Not counted</dt>
          <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">
            {filteredTotal.toLocaleString("en-NG")}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        {formatNaira(stats.cpcKobo)} per click, up to{" "}
        {formatNaira(stats.capKobo)}.
        {viewer === "creator" &&
          " Our 5% fee comes off when the money is released after the campaign."}{" "}
        Counts are as of when you opened this page.
      </p>
      {stats.blockedShares.map((channel) => (
        <p
          key={channel}
          className="flex items-start gap-2 text-sm font-medium text-ink"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-danger"
            aria-hidden="true"
          />
          {blockedShareWarning(channel)}
        </p>
      ))}
      {notCounted.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-ink">
            Why some visits weren’t counted
          </summary>
          <ul className="mt-2 space-y-1">
            {notCounted.map((reason) => (
              <li key={reason} className="flex justify-between gap-4">
                <span>{filterReasonText(reason)}</span>
                <span className="tabular-nums">{stats.filtered[reason]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Where the link must not go: the business's blocked channels and the two rules that always apply. */
function SharingRules({ blocked }: { blocked: Channel[] }) {
  const names = blocked.map((c) => CHANNEL_LABELS[c]);
  const list =
    names.length <= 1
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  return (
    <p className="flex items-start gap-2 text-sm text-ink">
      <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {names.length > 0 &&
          `Don’t share it on ${list}: those clicks aren’t paid. `}
        No paid ads or click-for-reward groups.
      </span>
    </p>
  );
}
