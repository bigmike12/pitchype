import { BadgeCheck, BriefcaseBusiness, CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

import type { PlatformListing } from "@/lib/creator-profile";

const monthYear = new Intl.DateTimeFormat("en-NG", {
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

/**
 * What Pitchype itself knows about a creator, only ever from real records:
 * jobs paid out through Pitchype (left out at zero), when they joined, and
 * how many accounts we've verified.
 */
export function TrackRecord({
  completedJobs,
  memberSince,
  platforms,
}: {
  completedJobs: number;
  memberSince: string;
  platforms: PlatformListing[];
}) {
  const verified = platforms.filter((p) => p.verified).length;
  return (
    <dl className="space-y-4">
      {completedJobs > 0 && (
        <Fact
          icon={<BriefcaseBusiness className="size-4" aria-hidden="true" />}
          term="Jobs done on Pitchype"
        >
          {completedJobs.toLocaleString("en-NG")} paid{" "}
          {completedJobs === 1 ? "job" : "jobs"}
        </Fact>
      )}
      <Fact
        icon={<CalendarDays className="size-4" aria-hidden="true" />}
        term="On Pitchype since"
      >
        {monthYear.format(new Date(memberSince))}
      </Fact>
      {verified > 0 && (
        <Fact
          icon={<BadgeCheck className="size-4" aria-hidden="true" />}
          term="Accounts verified"
        >
          {verified} of {platforms.length}
        </Fact>
      )}
    </dl>
  );
}

function Fact({
  icon,
  term,
  children,
}: {
  icon: ReactNode;
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-soft text-ink">
        {icon}
      </span>
      <div>
        <dt className="text-[0.8125rem] text-muted">{term}</dt>
        <dd className="font-semibold text-ink">{children}</dd>
      </div>
    </div>
  );
}
