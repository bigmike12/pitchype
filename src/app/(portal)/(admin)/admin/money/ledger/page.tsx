import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminLedgerTable } from "@/components/money/admin-ledger-table";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FilterBar, type ActiveFilter } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  FiltersSkeleton,
  HeaderSkeleton,
  PageLoading,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { pageCount } from "@/lib/paging";
import { listLedger } from "@/lib/db/money";
import {
  LEDGER_EVENTS,
  ledgerFilterQuery,
  parseLedgerFilter,
  type ParsedLedgerFilter,
} from "@/lib/ledger-filter";

export const metadata: Metadata = { title: "Ledger" };

const PAGE_SIZE = 50;
// What the CSV export holds: 25 pages of 200.
const EXPORT_LIMIT = 5000;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LedgerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-5xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the ledger…">
            <HeaderSkeleton crumbs action />
            <FiltersSkeleton />
            <div className="mt-6">
              <TableSkeleton rows={8} />
            </div>
          </PageLoading>
        }
      >
        <Ledger searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const eventOptions = LEDGER_EVENTS.map((value) => ({
  value,
  label: value.replaceAll("_", " "),
}));

/** The ledger page with one filter removed. */
function without(
  filter: ParsedLedgerFilter,
  key: "engagement" | "person" | "event" | "from" | "to",
): string {
  const query = ledgerFilterQuery({ ...filter, [key]: null });
  return query ? `/admin/money/ledger?${query}` : "/admin/money/ledger";
}

async function Ledger({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const filter = parseLedgerFilter(await searchParams);
  const fetchPage = (n: number) =>
    listLedger({
      person: filter.person,
      engagement: filter.engagement,
      eventType: filter.event,
      fromDate: filter.from,
      toDate: filter.to,
      limit: PAGE_SIZE,
      offset: (n - 1) * PAGE_SIZE,
    });
  let page = await fetchPage(filter.page);
  const pages = pageCount(page.total, PAGE_SIZE);
  // A link to a page past the end shows the last page, not an empty one.
  if (filter.page > pages) {
    filter.page = pages;
    page = await fetchPage(pages);
  }

  const active: ActiveFilter[] = [];
  if (filter.engagement) {
    active.push({
      label: "Hire",
      value: `${filter.engagement.slice(0, 8)}…`,
      href: without(filter, "engagement"),
    });
  }
  if (filter.person) {
    active.push({
      label: "Person",
      value: `${filter.person.slice(0, 8)}…`,
      href: without(filter, "person"),
    });
  }
  if (filter.event) {
    active.push({
      label: "Event",
      value: filter.event.replaceAll("_", " "),
      href: without(filter, "event"),
    });
  }
  if (filter.from) {
    active.push({
      label: "From",
      value: filter.from,
      href: without(filter, "from"),
    });
  }
  if (filter.to) {
    active.push({
      label: "To",
      value: filter.to,
      href: without(filter, "to"),
    });
  }

  const exportQuery = ledgerFilterQuery(filter);
  const pageHref = (n: number) => {
    const query = ledgerFilterQuery(filter, n);
    return query ? `/admin/money/ledger?${query}` : "/admin/money/ledger";
  };

  return (
    <>
      <PageHeader
        title="Ledger"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead="Every movement of money, one line each, newest first. Amounts are shown as stored: wallets, escrow and revenue are negative when money is owed or earned."
        actions={
          <Button asChild variant="secondary">
            <a
              href={`/admin/money/ledger/export${exportQuery ? `?${exportQuery}` : ""}`}
            >
              Export CSV
            </a>
          </Button>
        }
      />

      <FilterBar
        action="/admin/money/ledger"
        label="Filter the ledger"
        submitLabel="Apply filters"
        active={active}
        fieldsClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
      >
        <TextField
          compact
          label="Hire (id)"
          name="engagement"
          autoComplete="off"
          defaultValue={filter.engagement ?? ""}
        />
        <TextField
          compact
          label="Person (id)"
          name="person"
          autoComplete="off"
          defaultValue={filter.person ?? ""}
        />
        <SelectField
          compact
          label="Event"
          name="event"
          placeholder="Any event"
          options={eventOptions}
          defaultValue={filter.event ?? ""}
        />
        <TextField
          compact
          label="From (Lagos day)"
          name="from"
          type="date"
          defaultValue={filter.from ?? ""}
        />
        <TextField
          compact
          label="To (Lagos day)"
          name="to"
          type="date"
          defaultValue={filter.to ?? ""}
        />
      </FilterBar>

      <div className="mt-6" />
      {page.total > EXPORT_LIMIT && (
        <p className="mb-3 text-sm text-ink">
          The CSV export holds the newest {EXPORT_LIMIT.toLocaleString("en-NG")}{" "}
          lines; narrow the dates to export older ones.
        </p>
      )}

      {page.rows.length === 0 ? (
        <p className="rounded-card panel p-5 text-ink">
          No ledger lines match these filters.
        </p>
      ) : (
        <AdminLedgerTable
          rows={page.rows}
          footer={
            <Pagination
              framed
              page={filter.page}
              pages={pages}
              total={page.total}
              pageSize={PAGE_SIZE}
              noun={["line", "lines"]}
              hrefFor={pageHref}
            />
          }
        />
      )}
    </>
  );
}
