import { runMoneyChecks } from "@/lib/money-checks";

import { authorised } from "../authorised";

// Daily money checks: settles payouts stuck in `processing`, then records a
// reconciliation run against Paystack's balance. Safe to call twice (see
// src/lib/money-checks.ts). Vercel Cron calls it (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  return Response.json(await runMoneyChecks());
}
