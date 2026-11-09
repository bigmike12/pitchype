import { BadgeCheck } from "lucide-react";

import {
  FOLLOWER_RANGE_LABELS,
  PLATFORM_RULES,
  followersSourceText,
  followersText,
  type PlatformListing,
} from "@/lib/creator-profile";
import { cn } from "@/lib/utils";

import { PlatformIcon } from "./platform-icon";

export function VerifiedMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-brand-mint px-2 py-0.5 text-xs font-semibold text-ink",
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      Verified
    </span>
  );
}

/** The compact version on directory cards: icon, range, verified tick. */
export function PlatformSummary({
  platforms,
}: {
  platforms: PlatformListing[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink">
      {platforms.map((p) => (
        <li key={p.platform} className="inline-flex items-center gap-1.5">
          <PlatformIcon platform={p.platform} />
          <span className="sr-only">{PLATFORM_RULES[p.platform].label}:</span>
          <span className="font-medium">
            {p.verified && p.verifiedFollowerCount !== null
              ? compactCount(p.verifiedFollowerCount)
              : p.followerRange
                ? FOLLOWER_RANGE_LABELS[p.followerRange]
                : "–"}
          </span>
          {p.verified && (
            <>
              <BadgeCheck
                className="size-4 text-brand-green"
                aria-hidden="true"
              />
              <span className="sr-only">verified</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The full version on a profile page. Handles appear only when the viewer may see them. */
export function PlatformDetails({
  platforms,
}: {
  platforms: PlatformListing[];
}) {
  return (
    <ul className="divide-y divide-hairline rounded-card bg-white ring-1 ring-hairline">
      {platforms.map((p) => {
        const rules = PLATFORM_RULES[p.platform];
        return (
          <li key={p.platform} className="flex items-start gap-4 p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-card text-ink">
              <PlatformIcon platform={p.platform} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="font-semibold text-ink">{rules.label}</h3>
                {p.handle && (
                  <a
                    href={rules.profileUrl(p.handle)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="link text-sm break-all"
                  >
                    @{p.handle}
                    <span className="sr-only"> (opens {rules.label})</span>
                  </a>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-ink">
                <span className="font-medium">{followersText(p)}</span>
                {p.verified && <VerifiedMark />}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {followersSourceText(p)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 12400 → "12.4K", for the tight space on cards. */
function compactCount(count: number) {
  return new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}
