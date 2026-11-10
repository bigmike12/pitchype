import assert from "node:assert/strict";
import { test } from "node:test";

import { parseApplicationForm } from "./applications.ts";

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
