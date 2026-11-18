import { getSignedInUser } from "@/lib/auth";
import { clicksToCsv, type ClickCsvRow } from "@/lib/click-csv";
import { getCampaignClickResults, getCampaignClicks } from "@/lib/db/clicks";
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

  const [clicks, results] = await Promise.all([
    getCampaignClicks(id),
    getCampaignClickResults(id),
  ]);
  if (!clicks) return new Response("Not found.", { status: 404 });

  const settled = new Map(results?.hires.map((h) => [h.engagementId, h]));
  const rows: ClickCsvRow[] = clicks.hires.map((h) => {
    const result = settled.get(h.engagementId);
    return {
      creatorName: h.creatorName,
      code: h.code,
      billable: h.billable,
      notCounted: h.totalHits - h.billable,
      spentKobo: result ? result.releasedKobo : h.earnedKobo,
      backKobo: result ? result.backKobo : null,
      status: result ? "Settled" : "Running",
    };
  });

  return new Response(clicksToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pitchype-clicks-${id}-${lagosDateStamp(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
