import { identityCronStatus, runIdentityChecks } from "@/lib/identity";
import { reportServerError } from "@/lib/observability";
import { sendDueEmailsSafely } from "@/lib/send-emails";

import { authorised } from "../authorised";

// Daily identity backstop: abandons sessions that never started, deletes
// expired short-lived BVNs, and asks Dojah about sessions still open after 30
// minutes, treating each answer like a webhook. Safe to call twice (a repeated
// answer is the same event key). The status is 500 when any step failed so the
// scheduler's log shows it. Vercel Cron calls it (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await runIdentityChecks();
  await sendDueEmailsSafely();
  const status = identityCronStatus(result);
  if (status === 500) {
    await reportServerError(
      new Error("identity-checks finished with a failed step"),
      "GET /api/cron/identity-checks",
    );
  }
  return Response.json(result, { status });
}
