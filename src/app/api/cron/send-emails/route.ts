import { sendDueEmails, sendEmailsStatus } from "@/lib/send-emails";

import { authorised } from "../authorised";

// Sends the notification emails that are due (src/lib/send-emails.ts): chat
// emails once their 15 minutes pass, and retries of failed sends. Actions,
// webhooks and the daily jobs call the same function; this route is the
// backstop. Supabase pg_cron calls it every minute and Vercel Cron daily, both
// with `Authorization: Bearer $CRON_SECRET`. The status is 500 when any send
// failed so the scheduler's log shows it.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await sendDueEmails();
  return Response.json(result, { status: sendEmailsStatus(result) });
}
