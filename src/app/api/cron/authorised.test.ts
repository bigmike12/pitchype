import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { authorised } from "./authorised.ts";

const realSecret = process.env.CRON_SECRET;
const SECRET = "cron_unit_test_secret";

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (realSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = realSecret;
});

function requestWith(header?: string): Request {
  return new Request("http://localhost/api/cron/x", {
    headers: header === undefined ? {} : { authorization: header },
  });
}

test("the correct bearer is authorised", () => {
  assert.equal(authorised(requestWith(`Bearer ${SECRET}`)), true);
});

test("an unset secret never authorises, even for an empty bearer", () => {
  delete process.env.CRON_SECRET;
  assert.equal(authorised(requestWith("Bearer ")), false);
  assert.equal(authorised(requestWith("Bearer undefined")), false);
  assert.equal(authorised(requestWith()), false);
});

test("a wrong bearer, a wrong length and a missing header are refused", () => {
  assert.equal(authorised(requestWith(`Bearer ${SECRET.replace("c", "d")}`)), false);
  assert.equal(authorised(requestWith(`Bearer ${SECRET}x`)), false);
  assert.equal(authorised(requestWith(`Bearer ${SECRET.slice(1)}`)), false);
  assert.equal(authorised(requestWith(SECRET)), false);
  assert.equal(authorised(requestWith()), false);
});
