import { cronStatus, runMoneyChecks } from "@/lib/money-checks";

import { authorised } from "../authorised";

// Daily money checks: settles payouts stuck in `processing`, then records a
// reconciliation run against Paystack's balance. Safe to call twice (see
// src/lib/money-checks.ts). Same body either way, but the status is 500 when
// any step failed so the scheduler's log shows it. Vercel Cron calls it (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await runMoneyChecks();
  return Response.json(result, { status: cronStatus(result) });
}
