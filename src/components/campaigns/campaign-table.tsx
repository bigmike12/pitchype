import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatDay } from "@/lib/campaign";
import type { OwnCampaignSummary } from "@/lib/db/campaigns";
import { formatNaira } from "@/lib/money";

import { StatusPill } from "./campaign-facts";

type Counts = Map<string, { total: number; waiting: number }>;

/**
 * "3 to decide" (a pill) and "5 total", linking to the campaign's
 * applications. Sits above the row's own link so it stays clickable.
 */
function ApplicationsLink({ id, counts }: { id: string; counts: Counts }) {
  const count = counts.get(id) ?? { total: 0, waiting: 0 };
  if (count.total === 0) return <span className="text-muted">None yet</span>;
  return (
    <Link
      href={`/business/campaigns/${id}/applications`}
      className="relative inline-flex items-center gap-2 rounded-full py-1 underline-offset-4 hover:underline"
    >
      {count.waiting > 0 && (
        <span className="rounded-full bg-brand-lilac px-2.5 py-1 text-xs font-semibold text-ink">
          {count.waiting} to decide
        </span>
      )}
      <span className="text-muted">{count.total} total</span>
    </Link>
  );
}

const th = "px-5 py-3 text-[0.8125rem] font-medium text-muted";

/**
 * A business's campaigns: a table from 640px, a stacked list on phones. The
 * title is the link to each campaign and the whole row follows it; with
 * `counts`, a column shows the applications to decide, and `showCount` adds
 * a footer with how many campaigns there are.
 */
export function CampaignTable({
  campaigns,
  counts,
  showCount,
}: {
  campaigns: OwnCampaignSummary[];
  counts?: Counts;
  showCount?: boolean;
}) {
  const footer = showCount && (
    <p className="border-t border-hairline bg-surface-soft/60 px-5 py-3 text-sm text-muted">
      {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}
    </p>
  );

  return (
    <>
      <div className="overflow-hidden rounded-card panel sm:hidden">
        <ul className="divide-y divide-hairline">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="relative p-4 motion-safe:transition-colors active:bg-surface-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate font-semibold text-ink">
                  <Link
                    href={`/business/campaigns/${c.id}`}
                    className="after:absolute after:inset-0"
                  >
                    {c.title}
                  </Link>
                </h3>
                <StatusPill
                  status={c.status}
                  takenDown={Boolean(c.removedReason)}
                />
              </div>
              <p className="mt-1 text-sm text-muted">
                {c.priceKobo !== null &&
                  `${formatNaira(c.priceKobo)} per creator · `}
                {c.places} {c.places === 1 ? "place" : "places"} · closes{" "}
                {formatDay(c.applicationsCloseOn)}
              </p>
              {counts && (
                <p className="mt-2 text-sm">
                  <ApplicationsLink id={c.id} counts={counts} />
                </p>
              )}
            </li>
          ))}
        </ul>
        {footer}
      </div>

      <div className="hidden overflow-hidden rounded-card panel sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-surface-soft/60">
            <tr>
              <th scope="col" className={th}>
                Campaign
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={`${th} text-right`}>
                Per creator
              </th>
              <th scope="col" className={`${th} text-right`}>
                Places
              </th>
              {counts && (
                <th scope="col" className={th}>
                  Applications
                </th>
              )}
              <th scope="col" className="w-12">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline text-ink">
            {campaigns.map((c) => (
              <tr
                key={c.id}
                className="group relative hover:bg-surface-soft/60 motion-safe:transition-colors"
              >
                <th
                  scope="row"
                  className="max-w-xs px-5 py-4 font-semibold break-words"
                >
                  <Link
                    href={`/business/campaigns/${c.id}`}
                    className="underline-offset-4 group-hover:underline after:absolute after:inset-0"
                  >
                    {c.title}
                  </Link>
                  <span className="mt-0.5 block text-[0.8125rem] font-normal text-muted">
                    Applications close {formatDay(c.applicationsCloseOn)}
                  </span>
                </th>
                <td className="px-5 py-4">
                  <StatusPill
                    status={c.status}
                    takenDown={Boolean(c.removedReason)}
                  />
                </td>
                <td className="px-5 py-4 text-right whitespace-nowrap tabular-nums">
                  {c.priceKobo !== null ? formatNaira(c.priceKobo) : "—"}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {c.places}
                </td>
                {counts && (
                  <td className="px-5 py-4 whitespace-nowrap">
                    <ApplicationsLink id={c.id} counts={counts} />
                  </td>
                )}
                <td className="py-4 pr-4 text-muted">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 group-hover:translate-x-0.5 group-hover:text-ink motion-safe:transition-transform"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer}
      </div>
    </>
  );
}
