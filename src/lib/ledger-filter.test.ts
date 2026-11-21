import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LEDGER_EVENTS,
  ledgerFilterQuery,
  lagosDateStamp,
  parseLedgerFilter,
} from "./ledger-filter.ts";

const UUID = "5e000000-0000-0000-0000-0000000e0001";

test("valid values are kept", () => {
  const f = parseLedgerFilter({
    engagement: UUID,
    person: UUID.toUpperCase(),
    event: "hire_settled",
    from: "2026-11-01",
    to: "2026-11-13",
    page: "3",
  });
  assert.deepEqual(f, {
    engagement: UUID,
    person: UUID,
    event: "hire_settled",
    from: "2026-11-01",
    to: "2026-11-13",
    page: 3,
  });
});

test("invalid values are ignored", () => {
  const f = parseLedgerFilter({
    engagement: "not-a-uuid",
    person: `${UUID}; drop table`,
    event: "made_up",
    from: "2026-13-45",
    to: "13/11/2026",
    page: "-2",
  });
  assert.deepEqual(f, {
    engagement: null,
    person: null,
    event: null,
    from: null,
    to: null,
    page: 1,
  });
});

test("repeated parameters use the first value, and missing ones are empty", () => {
  const f = parseLedgerFilter({ event: ["payout_paid", "hire_settled"] });
  assert.equal(f.event, "payout_paid");
  assert.equal(f.page, 1);
  assert.equal(f.engagement, null);
});

test("pages are whole numbers of at least 1 and capped", () => {
  assert.equal(parseLedgerFilter({ page: "0" }).page, 1);
  assert.equal(parseLedgerFilter({ page: "2.5" }).page, 1);
  assert.equal(parseLedgerFilter({ page: "99999999" }).page, 1);
});

// The ledger's event_type check constraint: the original nine, plus the four
// the Cray work added (deposit_received, processor_fee, cash_moved, payout_reversed).
test("there are thirteen event types", () => {
  assert.equal(LEDGER_EVENTS.length, 13);
});

test("the query string carries only the filters that are set", () => {
  const f = parseLedgerFilter({ event: "payout_paid", from: "2026-11-01" });
  assert.equal(ledgerFilterQuery(f), "event=payout_paid&from=2026-11-01");
  assert.equal(
    ledgerFilterQuery(f, 2),
    "event=payout_paid&from=2026-11-01&page=2",
  );
  assert.equal(ledgerFilterQuery(parseLedgerFilter({})), "");
});

test("the export file is dated by the Lagos calendar day", () => {
  // 23:30 UTC on the 13th is already the 14th in Lagos (UTC+1).
  assert.equal(lagosDateStamp(new Date("2026-11-13T23:30:00Z")), "2026-11-14");
  assert.equal(lagosDateStamp(new Date("2026-11-13T10:00:00Z")), "2026-11-13");
});

test("the new Cray events are valid filters", () => {
  for (const event of [
    "deposit_received",
    "processor_fee",
    "cash_moved",
    "payout_reversed",
  ]) {
    assert.ok((LEDGER_EVENTS as readonly string[]).includes(event), event);
    assert.equal(parseLedgerFilter({ event }).event, event);
  }
});
