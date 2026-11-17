// The admin ledger's filters, read from a page's search parameters or an
// export link. Every value is checked here and anything invalid is ignored,
// so a mistyped link shows the unfiltered ledger rather than an error. No
// framework imports, so node tests cover it.

export const LEDGER_EVENTS = [
  "payment_received",
  "hire_funded",
  "hire_settled",
  "payout_requested",
  "payout_rejected",
  "payout_paid",
  "payout_failed",
  "paystack_fee",
  "correction",
] as const;

export type LedgerEvent = (typeof LEDGER_EVENTS)[number];

export type ParsedLedgerFilter = {
  engagement: string | null;
  person: string | null;
  event: LedgerEvent | null;
  /** Lagos calendar days, YYYY-MM-DD. */
  from: string | null;
  to: string | null;
  page: number;
};

// Far beyond any real ledger; stops a huge offset reaching the database.
const MAX_PAGE = 100_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, name: string): string {
  const value = params[name];
  const one = Array.isArray(value) ? value[0] : value;
  return typeof one === "string" ? one.trim() : "";
}

function uuid(params: Params, name: string): string | null {
  const value = first(params, name);
  return UUID.test(value) ? value.toLowerCase() : null;
}

function day(params: Params, name: string): string | null {
  const value = first(params, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Rejects 2026-13-45 and 2026-02-30: the date must survive a round trip.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function parseLedgerFilter(params: Params): ParsedLedgerFilter {
  const event = first(params, "event");
  const rawPage = first(params, "page");
  const page = /^\d{1,6}$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    engagement: uuid(params, "engagement"),
    person: uuid(params, "person"),
    event: (LEDGER_EVENTS as readonly string[]).includes(event)
      ? (event as LedgerEvent)
      : null,
    from: day(params, "from"),
    to: day(params, "to"),
    page: page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** The filters (and optionally a page) as a query string, without the "?". */
export function ledgerFilterQuery(
  filter: ParsedLedgerFilter,
  page?: number,
): string {
  const query = new URLSearchParams();
  if (filter.engagement) query.set("engagement", filter.engagement);
  if (filter.person) query.set("person", filter.person);
  if (filter.event) query.set("event", filter.event);
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  if (page !== undefined && page > 1) query.set("page", String(page));
  return query.toString();
}

const lagosDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Lagos calendar day, YYYY-MM-DD. */
export function lagosDateStamp(time: Date): string {
  return lagosDay.format(time);
}
