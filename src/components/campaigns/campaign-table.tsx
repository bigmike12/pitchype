import Link from "next/link";

import { formatDay } from "@/lib/campaign";
import type { OwnCampaignSummary } from "@/lib/db/campaigns";
import { formatNaira } from "@/lib/money";

import { StatusPill } from "./campaign-facts";

type Counts = Map<string, { total: number; waiting: number }>;

/** "3 to decide · 5" or "5", linking to the campaign's applications. */
function ApplicationsLink({ id, counts }: { id: string; counts: Counts }) {
  const count = counts.get(id) ?? { total: 0, waiting: 0 };
  if (count.total === 0) return <span className="text-muted">None yet</span>;
  return (
    <Link
      href={`/business/campaigns/${id}/applications`}
      className="relative font-semibold underline-offset-4 hover:underline"
    >
      {count.waiting > 0 ? `${count.waiting} to decide · ` : ""}
      {count.total}
    </Link>
  );
}

/**
 * A business's campaigns: a table from 640px, a stacked list on phones. The
 * title is the link to each campaign; with `counts`, a column shows the
 * applications to decide.
 */
export function CampaignTable({
  campaigns,
  counts,
}: {
  campaigns: OwnCampaignSummary[];
  counts?: Counts;
}) {
  return (
    <>
      <ul className="divide-y divide-hairline rounded-card panel sm:hidden">
        {campaigns.map((c) => (
          <li key={c.id} className="relative p-4">
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
              <p className="mt-1 text-sm">
                Applications: <ApplicationsLink id={c.id} counts={counts} />
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-card panel sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-soft text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Campaign
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Per creator
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Places
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Applications close
              </th>
              {counts && (
                <th scope="col" className="px-4 py-3 font-medium">
                  Applications
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline bg-white text-ink">
            {campaigns.map((c) => (
              <tr key={c.id}>
                <th
                  scope="row"
                  className="max-w-xs px-4 py-3 font-semibold break-words"
                >
                  <Link
                    href={`/business/campaigns/${c.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {c.title}
                  </Link>
                </th>
                <td className="px-4 py-3">
                  <StatusPill
                    status={c.status}
                    takenDown={Boolean(c.removedReason)}
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.priceKobo !== null ? formatNaira(c.priceKobo) : "—"}
                </td>
                <td className="px-4 py-3">{c.places}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDay(c.applicationsCloseOn)}
                </td>
                {counts && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ApplicationsLink id={c.id} counts={counts} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
