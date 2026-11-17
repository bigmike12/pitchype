import { cronStatus, runReviewDeadlines } from "@/lib/review-deadlines";

import { authorised } from "../authorised";

// Daily review deadlines: auto-releases work the business didn't review within
// 7 days, sends the 3-day and 1-day reminders, and clears proof uploads never
// attached. Safe to call twice or late (see src/lib/review-deadlines.ts). The
// status is 500 when any step failed so the scheduler's log shows it. Vercel
// Cron calls it (vercel.json) with `Authorization: Bearer $CRON_SECRET`; any
// other scheduler can do the same.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await runReviewDeadlines();
  return Response.json(result, { status: cronStatus(result) });
}
