import Link from "next/link";
import type { ReactNode } from "react";

import { TABLE } from "@/components/ui/table";

import { formatDateTime } from "@/lib/creator-profile";
import type { AdminLedgerRow } from "@/lib/db/money";
import { formatNaira } from "@/lib/money";

const th = TABLE.th;

const words = (value: string) => value.replaceAll("_", " ");

/** The amount as the ledger stores it: wallets, escrow and revenue are negative. */
function Amount({ kobo }: { kobo: number }) {
  return (
    <span className="font-semibold tabular-nums text-ink">
      <span aria-hidden="true">{kobo < 0 ? "−" : "+"}</span>
      <span className="sr-only">{kobo < 0 ? "Minus " : "Plus "}</span>
      {formatNaira(Math.abs(kobo))}
    </span>
  );
}

function Hire({ id }: { id: string | null }) {
  if (!id) return <span className="text-muted">None</span>;
  return (
    <Link href={`/admin/money/engagements/${id}`} className="link">
      Trail
    </Link>
  );
}

/**
 * The whole ledger for admins, one line per row, with the raw account names
 * and the amounts as stored. A stacked list on phones, a table from 640px
 * (the same pattern as `LedgerTable`, which words the same rows for the person
 * who owns the wallet).
 */
export function AdminLedgerTable({
  rows,
  footer,
}: {
  rows: AdminLedgerRow[];
  /** Sits at the foot of the frame (a `<Pagination framed />`). */
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="overflow-hidden rounded-card panel sm:hidden">
        <ul className="divide-y divide-hairline">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-semibold text-ink">
                  {words(row.eventType)}
                </p>
                <Amount kobo={row.amountKobo} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {words(row.account)}
                {row.ownerName && ` · ${row.ownerName}`}
              </p>
              <p className="text-sm text-muted">
                {formatDateTime(row.createdAt)} · {row.actorName}
              </p>
              {row.reason && (
                <p className="mt-1 text-sm break-words text-ink">
                  “{row.reason}”
                </p>
              )}
              <p className="mt-1 text-sm">
                <Hire id={row.engagementId} />
              </p>
            </li>
          ))}
        </ul>
        {footer}
      </div>

      <div className="hidden overflow-hidden rounded-card panel sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline bg-surface-soft/60">
              <tr>
                <th scope="col" className={th}>
                  Time
                </th>
                <th scope="col" className={th}>
                  Event
                </th>
                <th scope="col" className={th}>
                  Account
                </th>
                <th scope="col" className={th}>
                  Owner
                </th>
                <th scope="col" className={th}>
                  Hire
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-ink">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="align-top hover:bg-surface-soft/60 motion-safe:transition-colors"
                >
                  <td className="px-4 py-3 first:pl-5 last:pr-5 whitespace-nowrap text-muted">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <th
                    scope="row"
                    className="px-4 py-3 first:pl-5 last:pr-5 font-semibold"
                  >
                    {words(row.eventType)}
                    <span className="block text-[0.8125rem] font-normal text-muted">
                      {row.actorName}
                      {row.reason && `: “${row.reason}”`}
                    </span>
                  </th>
                  <td className="px-4 py-3 first:pl-5 last:pr-5">
                    {words(row.account)}
                  </td>
                  <td className="px-4 py-3 first:pl-5 last:pr-5">
                    {row.ownerName ?? <span className="text-muted">None</span>}
                  </td>
                  <td className="px-4 py-3 first:pl-5 last:pr-5">
                    <Hire id={row.engagementId} />
                  </td>
                  <td className="px-4 py-3 first:pl-5 last:pr-5 text-right whitespace-nowrap">
                    <Amount kobo={row.amountKobo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {footer}
      </div>
    </>
  );
}
