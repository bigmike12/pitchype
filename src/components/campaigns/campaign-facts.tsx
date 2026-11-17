// Pieces of a campaign shown to businesses, creators and admins alike: its
// status, what to post, and who can apply.

import { BadgeCheck, CalendarDays, Check, MapPin, Tags, X } from "lucide-react";

import { PlatformIcon } from "@/components/creators/platform-icon";
import {
  STATUS_LABELS,
  deliverableText,
  formatDay,
  type CampaignStatus,
  type Deliverable,
  type Problem,
} from "@/lib/campaign";
import {
  MIN_FOLLOWER_LABELS,
  PLATFORM_RULES,
  type FollowerRange,
  type Platform,
} from "@/lib/creator-profile";
import { stateLabel, type NigerianState } from "@/lib/profile";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<CampaignStatus, string> = {
  draft: "bg-surface-card text-ink",
  pending_review: "bg-brand-sun text-ink",
  open: "bg-brand-mint text-ink",
  paused: "bg-brand-peach text-ink",
  closed: "bg-surface-card text-muted",
  in_progress: "bg-brand-lilac text-ink",
  completed: "bg-surface-card text-ink",
  cancelled: "bg-surface-card text-muted",
};

export function StatusPill({
  status,
  takenDown,
}: {
  status: CampaignStatus;
  takenDown?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        takenDown ? "bg-surface-card text-danger" : STATUS_TONES[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {takenDown ? "Taken down" : STATUS_LABELS[status]}
    </span>
  );
}

export function DeliverableList({
  deliverables,
  postFrom,
  deliverBy,
}: {
  deliverables: Deliverable[];
  postFrom: string | null;
  deliverBy: string;
}) {
  return (
    <div>
      <ul className="space-y-2">
        {deliverables.map((d, i) => (
          <li key={i} className="flex items-center gap-2.5 text-ink">
            <PlatformIcon platform={d.platform} className="size-5" />
            {deliverableText(d)}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
        {postFrom
          ? `Post between ${formatDay(postFrom)} and ${formatDay(deliverBy)}`
          : `Posts up by ${formatDay(deliverBy)}`}
      </p>
    </div>
  );
}

type Requirement = { key: string; text: string; met: boolean | null };

/**
 * Who can apply. With `problems` (a creator viewing), each line shows
 * whether they meet it; without (business, admin), it's a plain list.
 */
export function RequirementList({
  platforms,
  verifiedOnly,
  nicheNames,
  states,
  problems,
}: {
  platforms: { platform: Platform; minFollowers: FollowerRange | null }[];
  verifiedOnly: boolean;
  nicheNames: string[];
  states: NigerianState[];
  problems?: Problem[];
}) {
  const checking = problems !== undefined;
  const failsOn = (platform: Platform) =>
    problems?.some((p) => "platform" in p && p.platform === platform) ?? false;

  const lines: (Requirement & { icon: React.ReactNode })[] = [
    ...platforms.map((p) => {
      const label = PLATFORM_RULES[p.platform].label;
      const followers = p.minFollowers
        ? `${MIN_FOLLOWER_LABELS[p.minFollowers]} ${label} followers`
        : `A ${label} account`;
      return {
        key: p.platform,
        text: verifiedOnly ? `${followers}, verified` : followers,
        met: checking ? !failsOn(p.platform) : null,
        icon: verifiedOnly ? (
          <BadgeCheck className="size-4" aria-hidden="true" />
        ) : (
          <PlatformIcon platform={p.platform} />
        ),
      };
    }),
    {
      key: "niche",
      text:
        nicheNames.length > 0
          ? `Creates ${nicheNames.join(", ").toLowerCase()} content`
          : "Any niche",
      met: checking ? !problems?.some((p) => p.code === "niche") : null,
      icon: <Tags className="size-4" aria-hidden="true" />,
    },
    {
      key: "state",
      text:
        states.length > 0
          ? `Based in ${states.map(stateLabel).join(", ")}`
          : "Anywhere in Nigeria",
      met: checking ? !problems?.some((p) => p.code === "state") : null,
      icon: <MapPin className="size-4" aria-hidden="true" />,
    },
  ];

  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line.key} className="flex items-start gap-2.5 text-ink">
          <span
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
              line.met === null && "text-ink",
              line.met === true && "bg-brand-mint text-ink",
              line.met === false && "bg-surface-card text-danger",
            )}
          >
            {line.met === null ? (
              line.icon
            ) : line.met ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <X className="size-3.5" aria-hidden="true" />
            )}
          </span>
          <span>
            {line.text}
            {line.met !== null && (
              <span className="sr-only">
                {line.met ? " (you meet this)" : " (you don't meet this yet)"}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
