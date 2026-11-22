import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminLedgerRow } from "./db/money.ts";
import { koboToNairaString, ledgerToCsv } from "./ledger-csv.ts";

const row: AdminLedgerRow = {
  id: "r1",
  groupId: "g1",
  eventType: "hire_settled",
  account: "creator_wallet",
  ownerUserId: "u1",
  ownerName: "Ada",
  engagementId: "e1",
  paymentId: null,
  payoutId: null,
  paystackReference: null,
  amountKobo: -4_750_000,
  actorUserId: "a1",
  actorName: "Efe",
  reason: "Work approved",
  feeConfigId: "f1",
  createdAt: "2026-11-13T09:30:00+00:00",
};

const HEADER =
  "id,group_id,created_at,event_type,account,owner_user_id,owner_name,engagement_id,payment_id,payout_id,paystack_reference,amount_kobo,amount_naira,actor_user_id,actor_name,reason,fee_config_id";

test("an empty list is just the header", () => {
  assert.equal(ledgerToCsv([]), `${HEADER}\r\n`);
});

test("a row becomes one line, with UTC timestamps and both amounts", () => {
  const lines = ledgerToCsv([row]).trimEnd().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(
    lines[1],
    "r1,g1,2026-11-13T09:30:00.000Z,hire_settled,creator_wallet,u1,Ada,e1,,,,-4750000,-47500.00,a1,Efe,Work approved,f1",
  );
});

test("naira strings are built from integers", () => {
  assert.equal(koboToNairaString(0), "0.00");
  assert.equal(koboToNairaString(5), "0.05");
  assert.equal(koboToNairaString(-5), "-0.05");
  assert.equal(koboToNairaString(250_000), "2500.00");
  assert.equal(koboToNairaString(-95_406), "-954.06");
  assert.equal(koboToNairaString(9_007_199_254_740_990), "90071992547409.90");
});

test("cells with commas, quotes or newlines are quoted and quotes doubled", () => {
  const csv = ledgerToCsv([{ ...row, reason: 'Said "no", twice\nthen yes' }]);
  assert.ok(csv.includes('"Said ""no"", twice\nthen yes"'));
});

test("cells that a spreadsheet would run as a formula get a leading quote", () => {
  for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
    const csv = ledgerToCsv([
      { ...row, amountKobo: 100, reason: bad, ownerName: bad },
    ]);
    assert.ok(csv.includes(`'${bad}`) || csv.includes(`"'${bad}`), bad);
    assert.ok(!/(^|,)[=+\-@]/.test(csv.split("\r\n")[1] ?? ""), bad);
  }
});

test("a negative amount column is a number, not guarded", () => {
  const line = ledgerToCsv([row]).split("\r\n")[1] ?? "";
  assert.ok(line.includes(",-4750000,-47500.00,"));
});

test("a deposit row on the cray account exports like any other", () => {
  const csv = ledgerToCsv([
    {
      ...row,
      eventType: "deposit_received",
      account: "cray",
      ownerUserId: null,
      ownerName: null,
      engagementId: null,
      paystackReference: "dep-1",
      amountKobo: 5_250_000,
      reason: null,
    },
  ]);
  const line = csv.trimEnd().split("\r\n")[1] ?? "";
  assert.ok(line.includes(",deposit_received,cray,"));
  assert.ok(line.includes(",dep-1,5250000,52500.00,"));
});
