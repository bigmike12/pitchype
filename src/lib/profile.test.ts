import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NIGERIAN_STATES, parseProfileForm, stateLabel } from "./profile.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

test("lists the 36 states and the FCT", () => {
  assert.equal(NIGERIAN_STATES.length, 37);
  assert.equal(new Set(NIGERIAN_STATES).size, 37);
  assert.equal(stateLabel("FCT"), "FCT (Abuja)");
  assert.equal(stateLabel("Lagos"), "Lagos");
});

test("the state list matches the database domain exactly", () => {
  const sql = readFileSync(
    new URL(
      "../../supabase/migrations/20261108231856_create_users_and_profiles.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const domain = sql.match(
    /create domain public\.nigerian_state[\s\S]*?\);/,
  )?.[0];
  assert.ok(domain, "domain definition not found");
  const inSql = [...domain.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(inSql, [...NIGERIAN_STATES]);
});

test("a business profile, tidied", () => {
  assert.deepEqual(
    parseProfileForm(
      "business",
      form({
        businessName: "  Brightside   Juice ",
        contactName: "Ada Obi",
        state: "Lagos",
        city: " Lagos  Island ",
      }),
    ),
    {
      ok: true,
      value: {
        role: "business",
        businessName: "Brightside Juice",
        contactName: "Ada Obi",
        state: "Lagos",
        city: "Lagos Island",
      },
    },
  );
});

test("a creator profile", () => {
  assert.deepEqual(
    parseProfileForm(
      "influencer",
      form({ displayName: "Bayo Cooks", state: "FCT", city: "Garki" }),
    ),
    {
      ok: true,
      value: {
        role: "influencer",
        displayName: "Bayo Cooks",
        state: "FCT",
        city: "Garki",
      },
    },
  );
});

test("missing and out-of-range fields are reported per field", () => {
  const result = parseProfileForm(
    "business",
    form({
      businessName: "A",
      contactName: "",
      state: "Atlantis",
      city: "x".repeat(61),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(Object.keys(result.errors).sort(), [
      "businessName",
      "city",
      "contactName",
      "state",
    ]);
    assert.equal(result.values.businessName, "A");
  }
});

test("a creator form ignores business fields", () => {
  const result = parseProfileForm(
    "influencer",
    form({
      displayName: "",
      businessName: "Sneaky Co",
      state: "Oyo",
      city: "Ibadan",
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(Object.keys(result.errors), ["displayName"]);
});
