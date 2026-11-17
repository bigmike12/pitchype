import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applicationBucket,
  hireEndedUnpaid,
  parseApplicationForm,
  holdsPlace,
} from "./applications.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const CAMPAIGN = 5_000_000; // ₦50,000

test("no price, or the campaign price, means accepting the campaign price", () => {
  for (const price of ["", "50,000", "₦50000"]) {
    const parsed = parseApplicationForm(form({ price, note: "" }), CAMPAIGN);
    assert.deepEqual(parsed, {
      ok: true,
      value: { proposedPriceKobo: null, note: null },
    });
  }
});

test("a different price is a proposal in whole naira, from ₦5,000", () => {
  const ok = parseApplicationForm(form({ price: "65,000" }), CAMPAIGN);
  assert.deepEqual(ok, {
    ok: true,
    value: { proposedPriceKobo: 6_500_000, note: null },
  });

  const low = parseApplicationForm(form({ price: "4,999" }), CAMPAIGN);
  assert.equal(low.ok, false);
  assert.match(!low.ok ? (low.errors.price ?? "") : "", /lowest price/);

  const kobo = parseApplicationForm(form({ price: "5000.50" }), CAMPAIGN);
  assert.equal(kobo.ok, false);
  assert.match(!kobo.ok ? (kobo.errors.price ?? "") : "", /whole number/);
});

test("the note is optional, short, and free of contact details", () => {
  const ok = parseApplicationForm(
    form({ price: "", note: "  I post food reels daily  " }),
    CAMPAIGN,
  );
  assert.deepEqual(ok, {
    ok: true,
    value: { proposedPriceKobo: null, note: "I post food reels daily" },
  });

  const long = parseApplicationForm(form({ note: "x".repeat(501) }), CAMPAIGN);
  assert.match(!long.ok ? (long.errors.note ?? "") : "", /500 characters/);

  const phone = parseApplicationForm(
    form({ note: "Call 0803 123 4567" }),
    CAMPAIGN,
  );
  assert.match(!phone.ok ? (phone.errors.note ?? "") : "", /phone number/);
});

test("a hire has ended unpaid only when it lapsed or was cancelled before payment", () => {
  const ended = (
    status: string,
    fundedAt: string | null = null,
  ): Parameters<typeof hireEndedUnpaid>[0] => ({
    status: "approved",
    engagement: { status, fundedAt },
  });
  // Lapsed (or cancelled before paying): the place is free and the creator can return.
  assert.equal(hireEndedUnpaid(ended("cancelled")), true);
  // Still waiting for payment, paid, or finished: nothing to apply for.
  assert.equal(hireEndedUnpaid(ended("awaiting_payment")), false);
  assert.equal(hireEndedUnpaid(ended("funded", "2026-11-13T10:00:00Z")), false);
  assert.equal(hireEndedUnpaid(ended("in_progress", "2026-11-13T10:00:00Z")), false);
  // Cancelled after payment: money was involved, so no.
  assert.equal(hireEndedUnpaid(ended("cancelled", "2026-11-13T10:00:00Z")), false);
  // Other application states never reopen.
  for (const status of ["submitted", "shortlisted", "rejected", "withdrawn"]) {
    assert.equal(
      hireEndedUnpaid({
        status: status as "submitted",
        engagement: { status: "cancelled", fundedAt: null },
      }),
      false,
      status,
    );
  }
  // An approved application with no hire row at all (should not happen) stays closed.
  assert.equal(hireEndedUnpaid({ status: "approved", engagement: null }), false);
});

test("a hire that ended unpaid goes back to the business's to-decide list, not under Hired", () => {
  const hire = (status: string, fundedAt: string | null = null) => ({
    engagement: { status, fundedAt },
  });
  // Waiting for a decision.
  assert.equal(applicationBucket({ status: "submitted", engagement: null }), "waiting");
  assert.equal(applicationBucket({ status: "shortlisted", engagement: null }), "waiting");
  // A live or paid hire is Hired.
  assert.equal(applicationBucket({ status: "approved", ...hire("awaiting_payment") }), "hired");
  assert.equal(applicationBucket({ status: "approved", ...hire("funded", "2026-11-13T10:00:00Z") }), "hired");
  assert.equal(applicationBucket({ status: "approved", ...hire("cancelled", "2026-11-13T10:00:00Z") }), "hired");
  // Lapsed or cancelled before payment: the place is open again and the
  // business decides again. It must not read as a filled place.
  assert.equal(applicationBucket({ status: "approved", ...hire("cancelled") }), "waiting");
  // Passed over or withdrawn.
  assert.equal(applicationBucket({ status: "rejected", engagement: null }), "closed");
  assert.equal(applicationBucket({ status: "withdrawn", engagement: null }), "closed");
});

test("a hire holds a place unless it was cancelled, refunded or has lapsed unpaid", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const later = "2026-11-18T12:00:00Z";
  const earlier = "2026-11-17T11:00:00Z";
  for (const status of [
    "funded",
    "in_progress",
    "submitted",
    "denied",
    "disputed",
    "accepted",
  ]) {
    assert.equal(holdsPlace({ status, payBy: earlier }, now), true, status);
  }
  assert.equal(
    holdsPlace({ status: "awaiting_payment", payBy: later }, now),
    true,
  );
  // Past its pay-by time, the place is free even if the database hasn't said so yet.
  assert.equal(
    holdsPlace({ status: "awaiting_payment", payBy: earlier }, now),
    false,
  );
  assert.equal(holdsPlace({ status: "cancelled", payBy: later }, now), false);
  assert.equal(holdsPlace({ status: "refunded", payBy: later }, now), false);
});
