import { BadgeCheck, CalendarClock, MapPin } from "lucide-react";
import Link from "next/link";

import { PlatformIcon } from "@/components/creators/platform-icon";
import {
  creatorReceivesKobo,
  deliverableText,
  formatDay,
  problemText,
} from "@/lib/campaign";
import type { CampaignListing } from "@/lib/db/campaigns";
import { formatNaira } from "@/lib/money";

/** One open campaign in a creator's list, with whether they qualify. */
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
    <article className="relative flex flex-col rounded-card panel p-5 hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:hover:-translate-y-px has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ink has-[a:hover]:ring-field [&_a]:outline-none">
      <div className="flex items-start justify-between gap-3">
        <ul className="flex gap-1.5" aria-label="Platforms">
          {campaign.platforms.map((p) => (
            <li
              key={p.platform}
              className="grid size-8 place-items-center rounded-full bg-surface-card text-ink"
            >
              <PlatformIcon platform={p.platform} />
            </li>
          ))}
        </ul>
        {qualifies ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-mint px-2.5 py-1 text-xs font-semibold text-ink">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            You qualify
          </span>
        ) : null}
      </div>

      <h2 className="mt-4 text-lg leading-snug font-semibold">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="after:absolute after:inset-0 after:rounded-card"
        >
          {campaign.title}
        </Link>
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        {campaign.businessName}, {campaign.businessCity}
      </p>

      <p className="mt-4 text-sm text-ink">
        {campaign.deliverables.map(deliverableText).join(", ")}
      </p>

      <div className="mt-auto pt-5">
        {campaign.priceKobo !== null && (
          <p className="text-display-md">
            {formatNaira(campaign.priceKobo)}
            <span className="ml-2 align-middle font-sans text-sm font-normal text-muted">
              you receive {formatNaira(creatorReceivesKobo(campaign.priceKobo))}
            </span>
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          Applications close {formatDay(campaign.applicationsCloseOn)}
        </p>
        {!qualifies && firstProblem && (
          <p className="mt-3 rounded-lg bg-surface-card px-3 py-2 text-sm text-ink">
            Not for you yet:{" "}
            {problemText(firstProblem, { nicheNames, states: campaign.states })}
            {campaign.problems.length > 1 &&
              ` (+${campaign.problems.length - 1} more)`}
          </p>
        )}
      </div>
    </article>
  );
}
