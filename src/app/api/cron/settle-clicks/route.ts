import { sendDueEmailsSafely } from "@/lib/send-emails";
import { runSettleClicks } from "@/lib/settle-clicks";

import { authorised } from "../authorised";

// Daily click settlement: tells both people when a per-click hire's clicks
// are in, and settles each hire for its counted clicks after the 72-hour hold.
// Safe to call twice or late (see src/lib/settle-clicks.ts). 500 when any hire
// failed so the scheduler's log shows it. Vercel Cron calls it (vercel.json)
// with `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await runSettleClicks();
  await sendDueEmailsSafely();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
