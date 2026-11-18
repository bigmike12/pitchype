import { getSignedInUser } from "@/lib/auth";
import { clickCsvRows, clicksToCsv } from "@/lib/click-csv";
import { getCampaignClicks } from "@/lib/db/clicks";
import { lagosDateStamp } from "@/lib/ledger-filter";

// A per-click campaign's clicks as a CSV, for the business that owns it. The
// role is checked here; ownership is checked again by the database summary,
// which answers nothing for anyone else (so they get a 404).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSignedInUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (user.role !== "business") {
    return new Response("Not allowed.", { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found.", { status: 404 });

  const clicks = await getCampaignClicks(id);
  if (!clicks) return new Response("Not found.", { status: 404 });
  const rows = clickCsvRows(clicks.hires);

  return new Response(clicksToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pitchype-clicks-${id}-${lagosDateStamp(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
