import { BadgeCheck, CalendarClock, Users } from "lucide-react";
import Link from "next/link";

import type { Tone } from "@/components/brand/stickers";
import { PlatformIcon } from "@/components/creators/platform-icon";
import { TILE_TONES } from "@/components/ui/stat-card";
import {
  creatorReceivesKobo,
  deliverableText,
  formatDay,
  placesLeftText,
  problemText,
} from "@/lib/campaign";
import type { CampaignListing } from "@/lib/db/campaigns";
import { formatNaira } from "@/lib/money";
import { stateLabel } from "@/lib/profile";
import { cn } from "@/lib/utils";

const TONES: Tone[] = ["lilac", "mint", "sun", "sky", "peach", "rose"];

/** The same business always gets the same tile colour. */
function toneFor(name: string): Tone {
  let sum = 0;
  for (const char of name) sum += char.codePointAt(0) ?? 0;
  return TONES[sum % TONES.length];
}

/**
 * One open campaign in a creator's list: who is hiring, the title, what to
 * post, then a footer strip with the pay (and what the creator receives
 * after our fee), the closing date and the places. Says whether the creator
 * qualifies, and the first reason when they don't.
 */
export function CampaignCard({
  campaign,
  nicheNames,
}: {
  campaign: CampaignListing;
  nicheNames: string[];
}) {
  const qualifies = campaign.problems.length === 0;
  const firstProblem = campaign.problems[0];

  return (
    <article className="relative flex flex-col overflow-hidden rounded-card panel hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:hover:-translate-y-px has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ink has-[a:hover]:ring-field [&_a]:outline-none">
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-control text-sm font-semibold text-ink",
              TILE_TONES[toneFor(campaign.businessName)],
            )}
          >
            {campaign.businessName.trim().charAt(0).toUpperCase()}
          </span>
          <p className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-medium text-ink">
              {campaign.businessName}
            </span>
            <span className="block truncate text-xs text-muted">
              {campaign.businessCity}, {stateLabel(campaign.businessState)}
            </span>
          </p>
          {qualifies && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-mint px-2 py-1 text-xs font-semibold text-ink">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              You qualify
            </span>
          )}
        </div>

        <h2 className="mt-3 line-clamp-2 text-base leading-snug font-semibold">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="after:absolute after:inset-0 after:rounded-card"
          >
            {campaign.title}
          </Link>
        </h2>

        {campaign.deliverables.length > 0 && (
          <ul
            aria-label="What you post"
            className="mt-3 flex flex-wrap gap-1.5"
          >
            {campaign.deliverables.map((deliverable, index) => (
              <li
                key={index}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-hairline"
              >
                <PlatformIcon
                  platform={deliverable.platform}
                  className="size-3.5"
                />
                {deliverableText(deliverable)}
              </li>
            ))}
          </ul>
        )}

        {!qualifies && firstProblem && (
          <p className="mt-3 rounded-lg bg-surface-card px-3 py-2 text-[0.8125rem] text-ink">
            Not for you yet:{" "}
            {problemText(firstProblem, { nicheNames, states: campaign.states })}
            {campaign.problems.length > 1 &&
              ` (+${campaign.problems.length - 1} more)`}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-hairline bg-surface-soft/60 px-4 py-3">
        {campaign.paymentModel === "per_click" &&
        campaign.cpcKobo !== null &&
        campaign.priceKobo !== null ? (
          <p>
            <span className="block font-display text-xl leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
              {formatNaira(campaign.cpcKobo)}
              <span className="text-sm font-normal text-muted"> a click</span>
            </span>
            <span className="mt-1.5 block text-xs text-muted">
              Up to {formatNaira(campaign.priceKobo)}
            </span>
          </p>
        ) : (
          campaign.priceKobo !== null && (
            <p>
              <span className="block font-display text-xl leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
                {formatNaira(campaign.priceKobo)}
              </span>
              <span className="mt-1.5 block text-xs text-muted">
                You receive{" "}
                {formatNaira(creatorReceivesKobo(campaign.priceKobo))}
              </span>
            </p>
          )
        )}
        <p className="ml-auto space-y-1 text-right text-xs text-muted">
          <span className="flex items-center justify-end gap-1">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            Closes {formatDay(campaign.applicationsCloseOn)}
          </span>
          <span className="flex items-center justify-end gap-1">
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
            {placesLeftText(campaign.places, campaign.placesTaken)}
          </span>
        </p>
      </div>
    </article>
  );
}
