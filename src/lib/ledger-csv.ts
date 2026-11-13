// The admin ledger as a CSV file. Text cells are written so a spreadsheet
// shows them as text and never runs them (a name or reason starting with "="
// would otherwise be a formula). Amounts are written from integers, in kobo
// and in naira, with no float maths. No framework imports, so node tests
// cover it.

import type { AdminLedgerRow } from "./db/money.ts";

const COLUMNS = [
  "id",
  "group_id",
  "created_at",
  "event_type",
  "account",
  "owner_user_id",
  "owner_name",
  "engagement_id",
  "payment_id",
  "payout_id",
  "paystack_reference",
  "amount_kobo",
  "amount_naira",
  "actor_user_id",
  "actor_name",
  "reason",
  "fee_config_id",
] as const;

// Characters that make a spreadsheet read a cell as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

function textCell(value: string | null): string {
  if (value === null || value === "") return "";
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** 4_750_000 → "47500.00", -95_406 → "-954.06": built from the integer, no floats. */
export function koboToNairaString(kobo: number): string {
  if (!Number.isSafeInteger(kobo)) {
    throw new Error(`Amounts must be whole kobo, got ${kobo}`);
  }
  const abs = Math.abs(kobo);
  const remainder = abs % 100;
  const naira = (abs - remainder) / 100;
  return `${kobo < 0 ? "-" : ""}${naira}.${String(remainder).padStart(2, "0")}`;
}

function toUtc(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? "" : time.toISOString();
}

export function ledgerToCsv(rows: AdminLedgerRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    // Amounts are numbers made by us, so they are never guarded (a negative
    // amount starts with "-").
    const cells = [
      textCell(r.id),
      textCell(r.groupId),
      textCell(toUtc(r.createdAt)),
      textCell(r.eventType),
      textCell(r.account),
      textCell(r.ownerUserId),
      textCell(r.ownerName),
      textCell(r.engagementId),
      textCell(r.paymentId),
      textCell(r.payoutId),
      textCell(r.paystackReference),
      String(r.amountKobo),
      koboToNairaString(r.amountKobo),
      textCell(r.actorUserId),
      textCell(r.actorName),
      textCell(r.reason),
      textCell(r.feeConfigId),
    ];
    lines.push(cells.join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
