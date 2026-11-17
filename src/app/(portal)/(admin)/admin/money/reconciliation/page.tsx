import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { TABLE } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  getLatestReconciliation,
  listReconciliationRuns,
} from "@/lib/db/money";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { Reconciliation } from "../reconciliation-callout";

export const metadata: Metadata = { title: "Reconciliation" };

// The most runs the data layer returns at once.
const RUNS_KEPT = 200;
const PAGE_SIZE = 15;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ReconciliationRunsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton crumbs />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <ReconciliationRuns searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** A difference, signed, with a word so it never relies on colour alone. */
function Difference({ kobo }: { kobo: number }) {
  if (kobo === 0) return <span className="text-muted">None</span>;
  return (
    <span className="font-semibold text-danger tabular-nums">
      {kobo < 0 ? "−" : "+"}
      {formatNaira(Math.abs(kobo))}
      <span className="font-normal"> (differs)</span>
    </span>
  );
}

/**
 * Each comparison of the ledger with Paystack's balance, so a difference
 * that appears, grows or clears is visible over time (spec §12). A stacked
 * list on phones, a table from 640px, like the ledger tables.
 */
async function ReconciliationRuns({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin");
  const [latest, runs, query] = await Promise.all([
    getLatestReconciliation(),
    listReconciliationRuns(RUNS_KEPT),
    searchParams,
  ]);
  const paged = pageOf(runs, parsePage(query.page), PAGE_SIZE);
  const footer = (
    <Pagination
      framed
      {...paged}
      noun={["check", "checks"]}
      hrefFor={(page) => pagedHref("/admin/money/reconciliation", {}, page)}
    />
  );

  return (
    <>
      <PageHeader
        title="Reconciliation"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead="Each daily check of the ledger against Paystack’s balance, newest first, in Lagos time. Difference is Paystack’s balance minus what the ledger expects."
      />
      <Reconciliation run={latest} />

      {paged.total > 0 && (
        <div className="mt-3">
          <div className={`${TABLE.frame} sm:hidden`}>
            <ul className={TABLE.list}>
              {paged.items.map((run) => (
                <li key={run.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-ink">
                      {formatDateTime(run.ranAt)}
                    </p>
                    <Difference kobo={run.differenceKobo} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Paystack {formatNaira(run.paystackBalanceKobo)} · expected{" "}
                    {formatNaira(run.expectedCashKobo)}
                  </p>
                  {run.note && (
                    <p className="mt-1 text-sm break-words text-ink">
                      {run.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {footer}
          </div>

          <div className={`${TABLE.frame} hidden sm:block`}>
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead className={TABLE.head}>
                  <tr>
                    <th scope="col" className={TABLE.th}>
                      Checked
                    </th>
                    <th scope="col" className={`${TABLE.th} text-right`}>
                      Paystack balance
                    </th>
                    <th scope="col" className={`${TABLE.th} text-right`}>
                      Expected cash
                    </th>
                    <th scope="col" className={`${TABLE.th} text-right`}>
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody className={TABLE.body}>
                  {paged.items.map((run) => (
                    <tr key={run.id} className="align-top">
                      <th
                        scope="row"
                        className="px-4 py-3 first:pl-5 last:pr-5 font-normal whitespace-nowrap"
                      >
                        {formatDateTime(run.ranAt)}
                        {run.note && (
                          <span className="block max-w-xs text-[0.8125rem] break-words whitespace-normal text-muted">
                            {run.note}
                          </span>
                        )}
                      </th>
                      <td className="px-4 py-3 first:pl-5 last:pr-5 text-right whitespace-nowrap tabular-nums">
                        {formatNaira(run.paystackBalanceKobo)}
                      </td>
                      <td className="px-4 py-3 first:pl-5 last:pr-5 text-right whitespace-nowrap tabular-nums">
                        {formatNaira(run.expectedCashKobo)}
                      </td>
                      <td className="px-4 py-3 first:pl-5 last:pr-5 text-right whitespace-nowrap">
                        <Difference kobo={run.differenceKobo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
