import { cronStatus, runMoneyChecks } from "@/lib/money-checks";
import { reportServerError } from "@/lib/observability";
import { sendDueEmailsSafely } from "@/lib/send-emails";

import { authorised } from "../authorised";

// Daily money checks: confirms Cray card payments that never heard back,
// settles payouts stuck in `processing`, then records a reconciliation run per
// payment provider that is set up. Safe to call twice (see
// src/lib/money-checks.ts). Same body either way, but the status is 500 when
// any step failed so the scheduler's log shows it. Vercel Cron calls it (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await runMoneyChecks();
  await sendDueEmailsSafely();
  const status = cronStatus(result);
  if (status === 500) {
    // The status is the only trace a failed step leaves, so report it here.
    await reportServerError(
      new Error("money-checks finished with a failed step"),
      "GET /api/cron/money-checks",
    );
  }
  return Response.json(result, { status });
}
