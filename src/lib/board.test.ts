import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUSINESS_COLUMNS,
  CREATOR_COLUMNS,
  businessColumn,
  creatorColumn,
  shownColumn,
} from "./board.ts";

const app = (
  status: string,
  engagement?: string,
  fundedAt: string | null = null,
) => ({
  status,
  engagement: engagement ? { status: engagement, fundedAt } : null,
});
const paid = "2026-11-12T10:00:00Z";

test("the hiring board follows decisions, payment and release", () => {
  assert.equal(businessColumn(app("submitted")), "applied");
  assert.equal(businessColumn(app("shortlisted")), "shortlisted");
  assert.equal(businessColumn(app("approved", "awaiting_payment")), "to_pay");
  for (const s of ["funded", "in_progress"]) {
    assert.equal(businessColumn(app("approved", s, paid)), "in_progress", s);
  }
  assert.equal(businessColumn(app("approved", "submitted", paid)), "to_review");
  assert.equal(businessColumn(app("approved", "denied", paid)), "changes");
  assert.equal(businessColumn(app("approved", "disputed", paid)), "disputed");
  for (const s of ["accepted", "auto_released", "paid_out"]) {
    assert.equal(businessColumn(app("approved", s, paid)), "completed", s);
  }
  assert.equal(businessColumn(app("approved", "refunded", paid)), "closed");
  assert.equal(businessColumn(app("approved", "cancelled", paid)), "closed");
  assert.equal(businessColumn(app("rejected")), "closed");
  assert.equal(businessColumn(app("withdrawn")), "closed");
});

test("a hire that ended unpaid is back with the business to decide", () => {
  assert.equal(businessColumn(app("approved", "cancelled")), "applied");
  // The creator sees it as closed: nothing is running.
  assert.equal(creatorColumn(app("approved", "cancelled")), "closed");
});

test("the creator's board follows the same facts from their side", () => {
  assert.equal(creatorColumn(app("submitted")), "applied");
  assert.equal(creatorColumn(app("shortlisted")), "applied");
  assert.equal(creatorColumn(app("approved", "awaiting_payment")), "hired");
  assert.equal(creatorColumn(app("approved", "funded", paid)), "ready");
  assert.equal(
    creatorColumn(app("approved", "in_progress", paid)),
    "in_progress",
  );
  assert.equal(creatorColumn(app("approved", "submitted", paid)), "to_review");
  assert.equal(creatorColumn(app("approved", "denied", paid)), "changes");
  assert.equal(creatorColumn(app("approved", "disputed", paid)), "disputed");
  for (const s of ["accepted", "auto_released", "paid_out"]) {
    assert.equal(creatorColumn(app("approved", s, paid)), "paid", s);
  }
  assert.equal(creatorColumn(app("approved", "refunded", paid)), "closed");
  assert.equal(creatorColumn(app("approved", "cancelled", paid)), "closed");
  assert.equal(creatorColumn(app("rejected")), "closed");
  assert.equal(creatorColumn(app("withdrawn")), "closed");
});

test("the new review columns sit between in progress and done, in order", () => {
  const keys = (cols: readonly { key: string }[]) => cols.map((c) => c.key);
  assert.deepEqual(keys(BUSINESS_COLUMNS).slice(3), [
    "in_progress",
    "to_review",
    "changes",
    "disputed",
    "completed",
  ]);
  assert.deepEqual(keys(CREATOR_COLUMNS).slice(3), [
    "in_progress",
    "to_review",
    "changes",
    "disputed",
    "paid",
  ]);
  const hint = (cols: readonly { key: string; hint: string }[], k: string) =>
    cols.find((c) => c.key === k)?.hint;
  assert.equal(hint(BUSINESS_COLUMNS, "to_review"), "Work submitted");
  assert.equal(hint(CREATOR_COLUMNS, "changes"), "Fix and resubmit");
});

test("every column a card can land in is drawn, or is closed", () => {
  const business = new Set<string>(BUSINESS_COLUMNS.map((c) => c.key));
  const creator = new Set<string>(CREATOR_COLUMNS.map((c) => c.key));
  const cases = [
    app("submitted"),
    app("shortlisted"),
    app("approved", "awaiting_payment"),
    app("approved", "funded", paid),
    app("approved", "in_progress", paid),
    app("approved", "submitted", paid),
    app("approved", "denied", paid),
    app("approved", "disputed", paid),
    app("approved", "accepted", paid),
    app("approved", "auto_released", paid),
    app("approved", "refunded", paid),
    app("approved"),
    app("rejected"),
  ];
  for (const c of cases) {
    const b = businessColumn(c);
    const k = creatorColumn(c);
    assert.ok(b === "closed" || business.has(b), b);
    assert.ok(k === "closed" || creator.has(k), k);
  }
});

test("a phone shows the asked column, else the first with cards", () => {
  const counts = new Map([
    ["applied", 0],
    ["shortlisted", 2],
    ["to_pay", 1],
  ] as const);
  assert.equal(shownColumn(BUSINESS_COLUMNS, counts, "to_pay"), "to_pay");
  assert.equal(shownColumn(BUSINESS_COLUMNS, counts, undefined), "shortlisted");
  assert.equal(
    shownColumn(BUSINESS_COLUMNS, counts, "nonsense"),
    "shortlisted",
  );
  assert.equal(shownColumn(BUSINESS_COLUMNS, new Map(), undefined), "applied");
});
