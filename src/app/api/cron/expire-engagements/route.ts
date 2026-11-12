import { timingSafeEqual } from "node:crypto";

import { expireUnpaidEngagements } from "@/lib/db/applications";

// Lapses approvals that weren't paid within 48 hours. Safe to call twice or
// late: the database function only changes what is due. Vercel Cron calls it
// daily (vercel.json) with `Authorization: Bearer $CRON_SECRET`; any other
// scheduler can do the same (docs/PROVIDERS.md).

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const expired = await expireUnpaidEngagements();
  return Response.json({ expired });
}
