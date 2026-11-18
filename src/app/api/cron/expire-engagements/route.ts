import { expireUnpaidEngagements } from "@/lib/db/applications";
import { sendDueEmailsSafely } from "@/lib/send-emails";

import { authorised } from "../authorised";

// Lapses approvals that weren't paid within 48 hours. Safe to call twice or
// late: the database function only changes what is due. Vercel Cron calls it
// daily (vercel.json) with `Authorization: Bearer $CRON_SECRET`; any other
// scheduler can do the same (docs/PROVIDERS.md).

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const expired = await expireUnpaidEngagements();
  await sendDueEmailsSafely();
  return Response.json({ expired });
}
