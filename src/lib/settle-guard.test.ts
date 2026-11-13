import assert from "node:assert/strict";
import { test } from "node:test";

import {
  alreadySettledMessage,
  settlementMatchesRequest,
} from "./settle-guard.ts";

const PRICE = 5_000_000;

test("the message names what already happened", () => {
  assert.equal(
    alreadySettledMessage("release"),
    "This hire was already settled (released to the creator) — nothing changed.",
  );
  assert.match(alreadySettledMessage("refund"), /refunded to the business/);
  assert.match(alreadySettledMessage("split"), /split/);
  assert.match(
    alreadySettledMessage("refund_creator_fault"),
    /creator at fault/,
  );
  assert.match(alreadySettledMessage(null), /already settled/);
});

test("a settlement that is what was asked for matches", () => {
  const stored = (settleOutcome: string, releasedKobo: number) => ({
    settleOutcome,
    releasedKobo,
  });
  const ask = (outcome: string, releaseKobo: number | null) => ({
    outcome,
    releaseKobo,
    agreedPriceKobo: PRICE,
  });
  assert.equal(
    settlementMatchesRequest(stored("release", PRICE), ask("release", null)),
    true,
  );
  assert.equal(
    settlementMatchesRequest(stored("refund", 0), ask("refund", null)),
    true,
  );
  assert.equal(
    settlementMatchesRequest(
      stored("refund_creator_fault", 0),
      ask("refund_creator_fault", null),
    ),
    true,
  );
  assert.equal(
    settlementMatchesRequest(
      stored("split", 2_000_000),
      ask("split", 2_000_000),
    ),
    true,
  );
});

test("a split of the whole price is stored as a release, and still matches", () => {
  assert.equal(
    settlementMatchesRequest(
      { settleOutcome: "release", releasedKobo: PRICE },
      { outcome: "split", releaseKobo: PRICE, agreedPriceKobo: PRICE },
    ),
    true,
  );
});

test("a different outcome, or a different split amount, does not match", () => {
  const req = (outcome: string, releaseKobo: number | null) => ({
    outcome,
    releaseKobo,
    agreedPriceKobo: PRICE,
  });
  assert.equal(
    settlementMatchesRequest(
      { settleOutcome: "release", releasedKobo: PRICE },
      req("refund", null),
    ),
    false,
  );
  assert.equal(
    settlementMatchesRequest(
      { settleOutcome: "split", releasedKobo: 1_000_000 },
      req("split", 2_000_000),
    ),
    false,
  );
  assert.equal(
    settlementMatchesRequest(
      { settleOutcome: null, releasedKobo: null },
      req("release", null),
    ),
    false,
  );
});
