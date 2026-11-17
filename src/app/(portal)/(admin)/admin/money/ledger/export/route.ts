import { getSignedInUser } from "@/lib/auth";
import { listLedger, type AdminLedgerRow } from "@/lib/db/money";
import { ledgerToCsv } from "@/lib/ledger-csv";
import { lagosDateStamp, parseLedgerFilter } from "@/lib/ledger-filter";

// The ledger as a CSV file, with the same filters as the page. Admins only:
// the check is here, and admin_ledger refuses anyone else again.

const PAGE_SIZE = 200;
const MAX_PAGES = 25; // 5,000 lines

export async function GET(request: Request) {
  const user = await getSignedInUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (user.role !== "admin")
    return new Response("Not allowed.", { status: 403 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filter = parseLedgerFilter(params);

  const rows: AdminLedgerRow[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await listLedger({
      person: filter.person,
      engagement: filter.engagement,
      eventType: filter.event,
      fromDate: filter.from,
      toDate: filter.to,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    rows.push(...result.rows);
    if (rows.length >= result.total) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  const headers: Record<string, string> = {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="pitchype-ledger-${lagosDateStamp(new Date())}.csv"`,
    "cache-control": "no-store",
  };
  // A comment line would corrupt the CSV, so a cut-off export says so here.
  if (truncated) headers["x-export-truncated"] = "true";
  return new Response(ledgerToCsv(rows), { headers });
}
