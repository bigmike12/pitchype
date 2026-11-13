import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  BUSINESS_FEE_BPS,
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  TRANSFER_FEE_TIERS,
  TRANSFER_STAMP_DUTY_FROM_KOBO,
  TRANSFER_STAMP_DUTY_KOBO,
} from "./fees.ts";

// The ledger migration seeds fee_config from one JSON literal between
// $fee_config_seed$ markers; read it and check it equals the TS constants.
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261113100000_create_ledger.sql",
    import.meta.url,
  ),
  "utf8",
);
const match = migration.match(
  /\$fee_config_seed\$([\s\S]*?)\$fee_config_seed\$/,
);
assert.ok(match, "the migration has a $fee_config_seed$ block");
const seed = JSON.parse(match[1]);

test("seeded fee_config rates and minimum fee equal src/lib/fees.ts", () => {
  assert.equal(seed.business_fee_bps, BUSINESS_FEE_BPS);
  assert.equal(seed.creator_fee_bps, INFLUENCER_FEE_BPS);
  assert.equal(seed.min_fee_kobo, MIN_FEE_KOBO);
  assert.equal(seed.min_payout_kobo, 100_000);
});

test("seeded transfer fee tiers and stamp duty equal src/lib/fees.ts", () => {
  assert.deepEqual(
    seed.transfer_fee_tiers,
    TRANSFER_FEE_TIERS.map((t) => ({
      up_to_kobo: t.upToKobo === Infinity ? null : t.upToKobo,
      fee_kobo: t.feeKobo,
    })),
  );
  assert.equal(seed.transfer_stamp_duty_kobo, TRANSFER_STAMP_DUTY_KOBO);
  assert.equal(
    seed.transfer_stamp_duty_from_kobo,
    TRANSFER_STAMP_DUTY_FROM_KOBO,
  );
});
