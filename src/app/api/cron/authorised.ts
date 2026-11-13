import { timingSafeEqual } from "node:crypto";

// The bearer check every scheduled route shares: Vercel Cron (or any other
// scheduler) sends `Authorization: Bearer $CRON_SECRET`. With no secret set,
// nothing is authorised.
export function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
